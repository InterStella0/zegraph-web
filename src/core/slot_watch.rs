//! Real-time player list of a game server for auto join.
//!
//! One poller per server, alive only while at least one SSE client watches it. Each client gets a
//! `snapshot` (every player, how long they have been on, plus slot counts) and then one
//! `join`/`leave` per player, so it can count free slots and spot its own name itself.

use std::collections::{BTreeMap, HashMap};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::Instant;
use futures::future::BoxFuture;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use poem_openapi::{Enum, Object};
use rand::{rng, RngExt};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tokio::sync::{Notify, Semaphore};
use crate::core::a2s::{self, A2sError, A2sInfo, A2sPlayer};

const EVENT_BUFFER: usize = 64;
/// How long a waiter stays listed after its stream ends. Streams rotate, and reconnect after
/// errors, well within this, so a tab that comes straight back never blinks off the list.
const WAITER_GRACE: Duration = Duration::from_secs(5);
pub(crate) const MAX_SLOT_CLIENTS: usize = 256;
/// How long a player stream lives before the server rotates it (plus up to the jitter). Well under
/// what anyone notices, since the client reconnects at once and the snapshot is a few KB.
pub(crate) const SLOT_STREAM_LIFETIME: Duration = Duration::from_secs(120);
pub(crate) const SLOT_STREAM_JITTER_MS: u64 = 20_000;

const POLL_MIN_MS: u64 = 500;
const POLL_MAX_MS: u64 = 3000;
/// Max players and the map rarely change, so `A2S_INFO` is refreshed far less often than the list.
const INFO_REFRESH: Duration = Duration::from_secs(15);
/// Consecutive failed polls before the server is reported offline.
const OFFLINE_AFTER: u32 = 3;
const OFFLINE_POLL: Duration = Duration::from_secs(10);
/// A name whose connect time moves by more than this between polls is someone else under that name
/// (players still connecting all share the empty one) or a restarted A2S clock: CS2 restarts every
/// player's at each map change.
const DRIFT_MS: i64 = 5000;

#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[oai(rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum SlotEventKind {
    Snapshot,
    Join,
    Leave,
    Meta,
    /// A poll got an answer. Carries the current `seq` without bumping it, so it doubles as a gap
    /// check, and tells clients how fresh the list is.
    Poll,
    /// Who has auto join armed changed. A full list, so it carries the current `seq` unbumped and
    /// needs no gap check.
    Waiting,
    Heartbeat,
    /// The server is ending this stream on purpose; reconnect right away. Streams are rotated
    /// because a proxy in front (Cloudflare) can keep one open long after its browser left, and
    /// nothing else would ever end it.
    Rotate,
}

#[derive(Object, Clone, Debug, PartialEq, Eq, Default, Serialize)]
pub struct SlotMeta {
    pub max_players: u16,
    /// From `A2S_INFO`. Clients count `players` instead, and fall back to this only when the
    /// server returns no players while reporting some.
    pub players: u16,
    pub online: bool,
    pub map: Option<String>,
}

/// Who has auto join armed on a server.
#[derive(Object, Clone, Debug, PartialEq, Eq, Default, Serialize)]
pub struct SlotWaiting {
    /// Signed-in users who have not anonymized themselves, once each however many tabs they have.
    pub names: Vec<String>,
    /// Everyone else: signed out, or anonymized.
    pub anonymous: u16,
}

/// One player. An empty name is a player still connecting.
#[derive(Object, Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SlotPlayer {
    pub name: String,
    /// How long they have been connected, per `A2S_PLAYER`, as of when this event was sent.
    pub connected_ms: u64,
}

/// One server-sent event. `seq` increases by exactly one per `join`, `leave`, `meta` and broadcast
/// `snapshot`; a client that sees a gap should reconnect for a fresh snapshot. A snapshot carries
/// the `seq` of the last event it already includes, and a `poll` the `seq` of the last event before
/// it. A `heartbeat` carries the latest `seq` but can overtake queued events, so it is no gap check.
#[derive(Object, Clone, Debug, PartialEq, Serialize)]
pub struct SlotEvent {
    pub kind: SlotEventKind,
    pub seq: u64,
    #[oai(skip_serializing_if_is_none)]
    pub meta: Option<SlotMeta>,
    /// Everyone on the server, `snapshot` only. Duplicate names are separate players.
    #[oai(skip_serializing_if_is_none)]
    pub players: Option<Vec<SlotPlayer>>,
    /// The player who joined or left, `join`/`leave` only. For a leave, `connected_ms` tells apart
    /// players sharing a name.
    #[oai(skip_serializing_if_is_none)]
    pub player: Option<SlotPlayer>,
    /// How long before this `snapshot` was sent the server last answered a poll. Absent if it never
    /// has. Later answers arrive as `poll` events, timed by when the client receives them.
    #[oai(skip_serializing_if_is_none)]
    pub polled_ms_ago: Option<u64>,
    /// Who is waiting to auto join, `snapshot` and `waiting` only.
    #[oai(skip_serializing_if_is_none)]
    pub waiting: Option<SlotWaiting>,
}

impl SlotEvent {
    fn bare(kind: SlotEventKind, seq: u64) -> Self {
        Self { kind, seq, meta: None, players: None, player: None, polled_ms_ago: None, waiting: None }
    }

    pub(crate) fn heartbeat(seq: u64) -> Self {
        Self::bare(SlotEventKind::Heartbeat, seq)
    }

    pub(crate) fn rotate(seq: u64) -> Self {
        Self::bare(SlotEventKind::Rotate, seq)
    }
}

/// A stream with auto join armed. `user_id` is set only from a verified ticket, and `name` only
/// when that user has not anonymized themselves.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Waiter {
    pub user_id: Option<i64>,
    pub name: Option<String>,
}

const TICKET_ISSUER: &str = "ze-graph-auto-join";
const TICKET_TTL: Duration = Duration::from_secs(12 * 3600);

/// Claims of a waiting-list ticket. The issuer differs from the session token's, so a ticket can
/// never pass as a login, and `srv` ties it to one server.
#[derive(Serialize, Deserialize)]
struct TicketClaims {
    sub: String,
    name: Option<String>,
    srv: String,
    exp: usize,
    iss: String,
}

/// Signs a ticket naming `user_id` in `server_id`'s waiting list. `EventSource` cannot send an
/// `Authorization` header, so the page fetches one of these and puts it in the stream URL.
pub(crate) fn issue_ticket(secret: &[u8], user_id: i64, name: Option<String>, server_id: &str) -> String {
    let exp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .saturating_add(TICKET_TTL)
        .as_secs() as usize;
    let claims = TicketClaims { sub: user_id.to_string(), name, srv: server_id.to_string(), exp, iss: TICKET_ISSUER.into() };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret)).expect("HS256 signing cannot fail")
}

/// The waiter a ticket names, if it is genuine, unexpired and for this server.
pub(crate) fn read_ticket(secret: &[u8], ticket: &str, server_id: &str) -> Option<Waiter> {
    let mut validation = Validation::default();
    validation.set_issuer(&[TICKET_ISSUER]);
    let claims = decode::<TicketClaims>(ticket, &DecodingKey::from_secret(secret), &validation).ok()?.claims;
    if claims.srv != server_id {
        return None;
    }
    Some(Waiter { user_id: Some(claims.sub.parse().ok()?), name: claims.name })
}

fn waiting_of(state: &WatchState) -> SlotWaiting {
    let mut users: BTreeMap<i64, Option<&str>> = BTreeMap::new();
    let mut anonymous = 0u16;
    for WaiterEntry { waiter, .. } in state.waiters.values() {
        match waiter.user_id {
            Some(id) => { users.entry(id).or_insert(waiter.name.as_deref()); }
            None => anonymous = anonymous.saturating_add(1),
        }
    }
    let mut names = Vec::new();
    for name in users.into_values() {
        match name {
            Some(name) => names.push(name.to_string()),
            None => anonymous = anonymous.saturating_add(1),
        }
    }
    names.sort_by_key(|name| name.to_lowercase());
    SlotWaiting { names, anonymous }
}

/// A listed waiter and how many of its streams are open (a tab reconnecting briefly has two).
struct WaiterEntry {
    waiter: Waiter,
    streams: usize,
}

/// A tab or connection id from the client: short and plain, so it can only ever key its own entry.
pub(crate) fn valid_client_id(tab: &str) -> bool {
    (8..=64).contains(&tab.len()) && tab.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

/// Keeps a waiter listed while its stream lives, and for `WAITER_GRACE` after.
pub(crate) struct WaiterGuard {
    watch: Arc<ServerWatch>,
    key: Option<String>,
}

impl Drop for WaiterGuard {
    fn drop(&mut self) {
        let Some(key) = self.key.take() else { return };
        let watch = self.watch.clone();
        match tokio::runtime::Handle::try_current() {
            Ok(runtime) => {
                runtime.spawn(async move {
                    tokio::time::sleep(WAITER_GRACE).await;
                    watch.release_waiter(&key);
                });
            }
            Err(_) => watch.release_waiter(&key),
        }
    }
}

/// A player between polls. `since` is when they connected, in ms on the watch's own clock, so a
/// duration can be worked out at any later moment.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Tracked {
    pub name: String,
    pub since: i64,
}

impl Tracked {
    fn at(&self, now: i64) -> SlotPlayer {
        SlotPlayer { name: self.name.clone(), connected_ms: (now - self.since).max(0) as u64 }
    }
}

#[derive(Default, Debug)]
pub(crate) struct PlayerDiff {
    pub left: Vec<Tracked>,
    pub joined: Vec<Tracked>,
    /// Players on both lists, with the connect time already known for them.
    pub kept: Vec<Tracked>,
    /// Most players' connect times moved at once: the server restarted its clock (a map change),
    /// and a fresh snapshot beats a leave and a join per player.
    pub drifted: bool,
}

/// Splits the change from `old` to `new`. Players are matched by name, and players sharing a name
/// by nearest connect time, so duplicates count separately and the right one leaves. A matched pair
/// whose times are more than `DRIFT_MS` apart is a different person: a leave plus a join. Output is
/// ordered by name.
pub(crate) fn diff_players(old: &[Tracked], new: &[Tracked]) -> PlayerDiff {
    let mut groups: BTreeMap<&str, (Vec<&Tracked>, Vec<&Tracked>)> = BTreeMap::new();
    for player in old {
        groups.entry(&player.name).or_default().0.push(player);
    }
    for player in new {
        groups.entry(&player.name).or_default().1.push(player);
    }
    let mut diff = PlayerDiff::default();
    let (mut pairs, mut moved) = (0usize, 0usize);
    for (olds, news) in groups.into_values() {
        // Pair each entry of the shorter side with the nearest unpaired one of the longer side.
        let old_is_short = olds.len() <= news.len();
        let (short, long) = if old_is_short { (&olds, &news) } else { (&news, &olds) };
        let mut paired = vec![false; long.len()];
        for player in short {
            let nearest = (0..long.len())
                .filter(|&i| !paired[i])
                .min_by_key(|&i| (long[i].since - player.since).abs())
                .expect("the longer side has an unpaired entry left");
            paired[nearest] = true;
            let (was, now) = if old_is_short { (*player, long[nearest]) } else { (long[nearest], *player) };
            pairs += 1;
            if (was.since - now.since).abs() > DRIFT_MS {
                moved += 1;
                diff.left.push(was.clone());
                diff.joined.push(now.clone());
            } else {
                diff.kept.push(was.clone());
            }
        }
        let unpaired = long.iter().zip(&paired).filter(|&(_, &p)| !p).map(|(player, _)| (*player).clone());
        if old_is_short { diff.joined.extend(unpaired) } else { diff.left.extend(unpaired) }
    }
    diff.drifted = moved > 1 && moved * 2 > pairs;
    diff
}

/// What one poll learned. `info` is `None` on ticks that skipped `A2S_INFO`.
pub(crate) struct Probe {
    pub info: Option<A2sInfo>,
    pub players: Vec<A2sPlayer>,
}

pub(crate) trait Prober: Send + Sync + 'static {
    fn info(&self, addr: SocketAddr) -> BoxFuture<'static, Result<A2sInfo, A2sError>>;
    fn players(&self, addr: SocketAddr) -> BoxFuture<'static, Result<Vec<A2sPlayer>, A2sError>>;
}

struct A2sProber;

impl Prober for A2sProber {
    fn info(&self, addr: SocketAddr) -> BoxFuture<'static, Result<A2sInfo, A2sError>> {
        Box::pin(a2s::query_info(addr))
    }

    fn players(&self, addr: SocketAddr) -> BoxFuture<'static, Result<Vec<A2sPlayer>, A2sError>> {
        Box::pin(a2s::query_players(addr))
    }
}

#[derive(Default)]
struct WatchState {
    players: Vec<Tracked>,
    meta: SlotMeta,
    seq: u64,
    /// False until the first poll finishes. Until then nobody gets a snapshot: an empty list would
    /// read as a server with every slot free.
    ready: bool,
    /// When the server last answered a poll, on the watch's clock.
    polled_at: Option<i64>,
    /// Who has auto join armed, keyed by the client's tab id, or per stream when it sent none.
    waiters: HashMap<String, WaiterEntry>,
    next_waiter: u64,
}

pub(crate) struct ServerWatch {
    state: Mutex<WatchState>,
    events: broadcast::Sender<SlotEvent>,
    epoch: Instant,
}

impl ServerWatch {
    fn new() -> Self {
        let (events, _) = broadcast::channel(EVENT_BUFFER);
        Self { state: Mutex::new(WatchState::default()), events, epoch: Instant::now() }
    }

    /// Milliseconds on this watch's clock, which connect times and poll times are kept on.
    fn now(&self) -> i64 {
        self.epoch.elapsed().as_millis() as i64
    }

    /// A receiver plus the snapshot it starts after, taken under one lock so no event falls
    /// between them or is counted twice. The snapshot is `None` before the first poll; the
    /// receiver then gets a broadcast snapshot once it lands.
    pub(crate) fn subscribe(&self) -> (broadcast::Receiver<SlotEvent>, Option<SlotEvent>) {
        let state = self.state.lock().expect("slot watch state poisoned");
        let receiver = self.events.subscribe();
        (receiver, state.ready.then(|| snapshot_of(&state, self.now())))
    }

    /// Lists a waiter until shortly after the returned guard drops. Streams sharing a `tab` id
    /// share one entry, so a tab reconnecting is never counted twice or dropped in between.
    pub(crate) fn add_waiter(self: &Arc<Self>, tab: Option<&str>, waiter: Waiter) -> WaiterGuard {
        let mut state = self.state.lock().expect("slot watch state poisoned");
        let key = match tab.filter(|tab| valid_client_id(tab)) {
            Some(tab) => format!("tab:{tab}"),
            None => {
                state.next_waiter += 1;
                format!("stream:{}", state.next_waiter)
            }
        };
        let before = waiting_of(&state);
        let entry = state.waiters.entry(key.clone()).or_insert(WaiterEntry { waiter: waiter.clone(), streams: 0 });
        entry.streams += 1;
        // The newest stream's identity wins: a ticket that arrived since then names the tab.
        entry.waiter = waiter;
        self.send_waiting_if_changed(&state, before);
        WaiterGuard { watch: self.clone(), key: Some(key) }
    }

    fn release_waiter(&self, key: &str) {
        let Ok(mut state) = self.state.lock() else { return };
        let before = waiting_of(&state);
        if let Some(entry) = state.waiters.get_mut(key) {
            entry.streams = entry.streams.saturating_sub(1);
            if entry.streams == 0 {
                state.waiters.remove(key);
            }
        }
        self.send_waiting_if_changed(&state, before);
    }

    fn send_waiting_if_changed(&self, state: &WatchState, before: SlotWaiting) {
        let waiting = waiting_of(state);
        if waiting != before {
            let _ = self.events.send(SlotEvent { waiting: Some(waiting), ..SlotEvent::bare(SlotEventKind::Waiting, state.seq) });
        }
    }

    pub(crate) fn seq(&self) -> u64 {
        self.state.lock().expect("slot watch state poisoned").seq
    }

    fn broadcast(&self, state: &mut WatchState, build: impl FnOnce(u64) -> SlotEvent) {
        state.seq += 1;
        // No receivers is fine: the poller notices and stops on its next tick.
        let _ = self.events.send(build(state.seq));
    }

    fn broadcast_snapshot(&self, state: &mut WatchState, now: i64) {
        let snapshot = snapshot_of(state, now);
        self.broadcast(state, |seq| SlotEvent { seq, ..snapshot });
    }

    /// Applies one answered poll. `players` connect times are on this watch's clock.
    fn apply(&self, meta: SlotMeta, players: Vec<Tracked>) {
        let now = self.now();
        let mut state = self.state.lock().expect("slot watch state poisoned");
        state.polled_at = Some(now);
        if !state.ready || !state.meta.online {
            state.players = players;
            state.meta = meta;
            state.ready = true;
            self.broadcast_snapshot(&mut state, now);
            return;
        }

        let diff = diff_players(&state.players, &players);
        // A burst past the buffer would make every client lag and resync anyway (a server emptying
        // at a map change does it); one snapshot is cheaper than that.
        let burst = diff.left.len() + diff.joined.len() > EVENT_BUFFER / 2;
        if diff.drifted || burst {
            // Every client's view would be off or flooded; one snapshot beats an event per player.
            state.players = players;
            state.meta = meta;
            self.broadcast_snapshot(&mut state, now);
            return;
        }
        for player in &diff.left {
            self.broadcast(&mut state, |seq| SlotEvent { player: Some(player.at(now)), ..SlotEvent::bare(SlotEventKind::Leave, seq) });
        }
        for player in &diff.joined {
            self.broadcast(&mut state, |seq| SlotEvent { player: Some(player.at(now)), ..SlotEvent::bare(SlotEventKind::Join, seq) });
        }
        // Known players keep their first connect time, so durations do not jitter poll to poll.
        state.players = diff.kept.into_iter().chain(diff.joined).collect();

        if state.meta != meta {
            state.meta = meta.clone();
            self.broadcast(&mut state, |seq| SlotEvent { meta: Some(meta), ..SlotEvent::bare(SlotEventKind::Meta, seq) });
        }
        let _ = self.events.send(SlotEvent::bare(SlotEventKind::Poll, state.seq));
    }

    fn mark_offline(&self) {
        let mut state = self.state.lock().expect("slot watch state poisoned");
        if state.ready && !state.meta.online {
            return;
        }
        state.players.clear();
        state.meta.online = false;
        state.meta.players = 0;
        state.ready = true;
        self.broadcast_snapshot(&mut state, self.now());
    }
}

fn snapshot_of(state: &WatchState, now: i64) -> SlotEvent {
    SlotEvent {
        meta: Some(state.meta.clone()),
        players: Some(state.players.iter().map(|player| player.at(now)).collect()),
        polled_ms_ago: state.polled_at.map(|at| (now - at).max(0) as u64),
        waiting: Some(waiting_of(state)),
        ..SlotEvent::bare(SlotEventKind::Snapshot, state.seq)
    }
}

pub(crate) struct SlotWatchHub {
    watches: Mutex<HashMap<String, Arc<ServerWatch>>>,
    pub(crate) clients: Arc<Semaphore>,
    prober: Arc<dyn Prober>,
    /// Open streams that named a connection id, so the page can end one by asking (see `close`).
    open_streams: Mutex<HashMap<String, Arc<Notify>>>,
}

/// Unlists a stream from `SlotWatchHub::open_streams` when it ends.
pub(crate) struct OpenStream {
    hub: Arc<SlotWatchHub>,
    key: String,
    pub(crate) closed: Arc<Notify>,
}

impl Drop for OpenStream {
    fn drop(&mut self) {
        let Ok(mut streams) = self.hub.open_streams.lock() else { return };
        // A later stream may have reused the id; only remove our own entry.
        if streams.get(&self.key).is_some_and(|notify| Arc::ptr_eq(notify, &self.closed)) {
            streams.remove(&self.key);
        }
    }
}

impl SlotWatchHub {
    pub(crate) fn new() -> Self {
        Self::with_prober(Arc::new(A2sProber))
    }

    pub(crate) fn with_prober(prober: Arc<dyn Prober>) -> Self {
        Self {
            watches: Mutex::new(HashMap::new()),
            clients: Arc::new(Semaphore::new(MAX_SLOT_CLIENTS)),
            prober,
            open_streams: Mutex::new(HashMap::new()),
        }
    }

    /// Lists a stream under the client's connection id until the returned handle drops. Its
    /// `closed` fires when the page asks to end it.
    pub(crate) fn open_stream(self: &Arc<Self>, server_id: &str, conn: &str) -> OpenStream {
        let key = format!("{server_id}:{conn}");
        let closed = Arc::new(Notify::new());
        self.open_streams.lock().expect("open stream map poisoned").insert(key.clone(), closed.clone());
        OpenStream { hub: self.clone(), key, closed }
    }

    /// Ends the stream the page opened under `conn`, if it is still open.
    ///
    /// Proxies in front (Cloudflare) do not pass on a browser closing its stream, but they do pass
    /// on a request, so the page sends this when it leaves. Rotation remains the backstop for pages
    /// that never get to send it (crashes, lost connections).
    pub(crate) fn close(&self, server_id: &str, conn: &str) -> bool {
        let streams = self.open_streams.lock().expect("open stream map poisoned");
        match streams.get(&format!("{server_id}:{conn}")) {
            Some(closed) => {
                // `notify_one` keeps a permit if the stream is mid-write, so the request is never lost.
                closed.notify_one();
                true
            }
            None => false,
        }
    }

    /// Subscribes to a server, starting its poller if nobody was watching it. The receiver is
    /// taken while the map is locked, so a poller deciding to stop can never strand it.
    pub(crate) fn subscribe(
        self: &Arc<Self>,
        server_id: &str,
        host: String,
        port: u16,
    ) -> (Arc<ServerWatch>, broadcast::Receiver<SlotEvent>, Option<SlotEvent>) {
        let mut watches = self.watches.lock().expect("slot watch map poisoned");
        let watch = match watches.get(server_id) {
            Some(watch) => watch.clone(),
            None => {
                let watch = Arc::new(ServerWatch::new());
                watches.insert(server_id.to_string(), watch.clone());
                tracing::info!(server_id, "starting A2S poller");
                tokio::spawn(poll_loop(self.clone(), server_id.to_string(), watch.clone(), host, port));
                watch
            }
        };
        let (receiver, snapshot) = watch.subscribe();
        (watch, receiver, snapshot)
    }

    /// Removes the server's watch if nobody is subscribed. Checked under the map lock, the same lock
    /// `subscribe` takes, so a client joining at this moment either keeps the poller or starts a
    /// fresh one.
    fn release_if_idle(&self, server_id: &str, watch: &Arc<ServerWatch>) -> bool {
        let mut watches = self.watches.lock().expect("slot watch map poisoned");
        if watch.events.receiver_count() > 0 {
            return false;
        }
        if watches.get(server_id).is_some_and(|current| Arc::ptr_eq(current, watch)) {
            watches.remove(server_id);
        }
        true
    }

    #[cfg(test)]
    pub(crate) fn watching(&self) -> usize {
        self.watches.lock().unwrap().len()
    }
}

async fn resolve(host: &str, port: u16) -> Option<SocketAddr> {
    tokio::net::lookup_host((host, port)).await.ok()?.next()
}

async fn poll_loop(hub: Arc<SlotWatchHub>, server_id: String, watch: Arc<ServerWatch>, host: String, port: u16) {
    let mut addr: Option<SocketAddr> = None;
    let mut last_info: Option<(Instant, A2sInfo)> = None;
    let mut failures: u32 = 0;
    let mut first = true;

    loop {
        if !first {
            let delay = if failures >= OFFLINE_AFTER {
                OFFLINE_POLL
            } else {
                Duration::from_millis(rng().random_range(POLL_MIN_MS..=POLL_MAX_MS))
            };
            tokio::time::sleep(delay).await;
        }
        first = false;

        if hub.release_if_idle(&server_id, &watch) {
            tracing::info!(server_id, "no watchers left, stopping A2S poller");
            return;
        }

        if addr.is_none() {
            addr = resolve(&host, port).await;
        }
        let result = match addr {
            Some(addr) => probe(hub.prober.as_ref(), addr, last_info.as_ref()).await,
            None => Err(A2sError::Unresolved),
        };

        match result {
            Ok(Probe { info, players }) => {
                failures = 0;
                if let Some(info) = info {
                    last_info = Some((Instant::now(), info));
                }
                let info = &last_info.as_ref().expect("probe returns info when none is cached").1;
                let meta = SlotMeta {
                    max_players: info.max_players as u16,
                    players: info.players as u16,
                    online: true,
                    map: Some(info.map.clone()).filter(|map| !map.is_empty()),
                };
                // Connect times go on the watch's clock now, so later durations need no new poll.
                let now = watch.now();
                let players = players.into_iter()
                    .map(|player| Tracked { since: now - player.duration.as_millis() as i64, name: player.name })
                    .collect();
                watch.apply(meta, players);
            }
            Err(e) => {
                failures += 1;
                tracing::debug!(server_id, failures, "A2S poll failed: {e}");
                if failures >= OFFLINE_AFTER {
                    watch.mark_offline();
                    last_info = None;
                    addr = None;
                }
            }
        }
    }
}

/// One poll: the player list every time, `A2S_INFO` when it is stale, missing, or needed because
/// the server is not returning players (its player count is then all clients have).
async fn probe(prober: &dyn Prober, addr: SocketAddr, last_info: Option<&(Instant, A2sInfo)>) -> Result<Probe, A2sError> {
    let players = prober.players(addr).await;
    let hiding_players = matches!(&players, Ok(players) if players.is_empty())
        && last_info.is_some_and(|(_, info)| info.players > 0);
    let info = match last_info {
        Some((at, _)) if at.elapsed() < INFO_REFRESH && !hiding_players && players.is_ok() => None,
        _ => Some(prober.info(addr).await?),
    };
    // A server that answers INFO but not PLAYER hides its list; count it from INFO instead.
    let players = match players {
        Ok(players) => players,
        Err(e) if info.is_some() => {
            tracing::debug!("A2S_PLAYER failed but A2S_INFO answered, treating the list as hidden: {e}");
            Vec::new()
        }
        Err(e) => return Err(e),
    };
    Ok(Probe { info, players })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use tokio::sync::broadcast::error::TryRecvError;

    fn tr(name: &str, since: i64) -> Tracked {
        Tracked { name: name.into(), since }
    }

    fn names_of(players: &[Tracked]) -> Vec<&str> {
        players.iter().map(|player| player.name.as_str()).collect()
    }

    #[test]
    fn diff_counts_duplicates_as_separate_players() {
        let diff = diff_players(&[tr("Bob", 0)], &[tr("Bob", 0), tr("Bob", 9_000)]);
        assert_eq!(diff.joined, vec![tr("Bob", 9_000)]);
        assert!(diff.left.is_empty() && !diff.drifted);
    }

    #[test]
    fn diff_the_right_duplicate_leaves() {
        let diff = diff_players(&[tr("Bob", 0), tr("Bob", 600_000), tr("Ann", 0)], &[tr("Bob", 600_100)]);
        assert_eq!(diff.left, vec![tr("Ann", 0), tr("Bob", 0)]);
        assert_eq!(diff.kept, vec![tr("Bob", 600_000)], "the remaining Bob keeps his own connect time");
        assert!(!diff.drifted);
    }

    #[test]
    fn diff_connecting_player_gets_a_name() {
        let diff = diff_players(&[tr("Ann", 0), tr("", 10_000)], &[tr("Ann", 0), tr("Bob", 10_000)]);
        assert_eq!(names_of(&diff.left), vec![""]);
        assert_eq!(names_of(&diff.joined), vec!["Bob"]);
    }

    #[test]
    fn diff_reordered_with_poll_jitter_is_empty_and_keeps_old_times() {
        let diff = diff_players(&[tr("Ann", 0), tr("Bob", 5_000)], &[tr("Bob", 5_040), tr("Ann", -30)]);
        assert!(diff.left.is_empty() && diff.joined.is_empty() && !diff.drifted);
        assert_eq!(diff.kept, vec![tr("Ann", 0), tr("Bob", 5_000)]);
    }

    #[test]
    fn diff_one_moved_time_is_a_different_player() {
        // One connecting player finished and another started between two polls.
        let diff = diff_players(&[tr("Ann", 0), tr("Bob", 0), tr("", 1_000)], &[tr("Ann", 0), tr("Bob", 0), tr("", 11_000)]);
        assert_eq!(diff.left, vec![tr("", 1_000)]);
        assert_eq!(diff.joined, vec![tr("", 11_000)]);
        assert!(!diff.drifted);
    }

    #[test]
    fn diff_flags_a_restarted_clock() {
        let old = [tr("Ann", 0), tr("Bob", 0), tr("Cid", 0)];
        let new = [tr("Ann", 1_200_000), tr("Bob", 1_200_000), tr("Cid", 0)];
        assert!(diff_players(&old, &new).drifted);
    }

    /// One scripted player: name and when they connected, in seconds on the virtual clock.
    type Entry = (&'static str, i64);

    /// Replays scripted player lists, reporting durations from each player's connect time the way a
    /// real server does; `None` is a failed poll.
    struct Scripted {
        lists: Mutex<VecDeque<Option<Vec<Entry>>>>,
        max_players: u8,
        start: Instant,
    }

    impl Scripted {
        fn new(lists: Vec<Option<&[Entry]>>) -> Arc<Self> {
            Arc::new(Self {
                lists: Mutex::new(lists.into_iter().map(|l| l.map(<[Entry]>::to_vec)).collect()),
                max_players: 4,
                start: Instant::now(),
            })
        }

        fn current(&self) -> Option<Vec<Entry>> {
            let mut lists = self.lists.lock().unwrap();
            if lists.len() > 1 { lists.pop_front().unwrap() } else { lists.front().cloned().unwrap() }
        }
    }

    impl Prober for Scripted {
        fn info(&self, _: SocketAddr) -> BoxFuture<'static, Result<A2sInfo, A2sError>> {
            let peek = self.lists.lock().unwrap().front().cloned().flatten();
            let max_players = self.max_players;
            Box::pin(async move {
                let list = peek.ok_or(A2sError::Timeout)?;
                Ok(A2sInfo { map: "ze_test".into(), players: list.len() as u8, max_players, bots: 0 })
            })
        }

        fn players(&self, _: SocketAddr) -> BoxFuture<'static, Result<Vec<A2sPlayer>, A2sError>> {
            let now = self.start.elapsed().as_millis() as i64;
            let list = self.current().map(|list| list.into_iter().map(|(name, connected)| A2sPlayer {
                name: name.into(),
                duration: Duration::from_millis((now - connected * 1000).max(0) as u64),
            }).collect());
            Box::pin(async move { list.ok_or(A2sError::Timeout) })
        }
    }

    /// Applies events the way the frontend does and checks `seq` has no gaps. Connect times are
    /// worked out on the test's clock from each event's `connected_ms`.
    struct Client {
        players: Vec<Tracked>,
        meta: Option<SlotMeta>,
        seq: Option<u64>,
        polls: usize,
        snapshots: usize,
        start: Instant,
    }

    impl Client {
        fn new(start: Instant) -> Self {
            Self { players: Vec::new(), meta: None, seq: None, polls: 0, snapshots: 0, start }
        }

        fn track(&self, player: SlotPlayer) -> Tracked {
            Tracked { since: self.start.elapsed().as_millis() as i64 - player.connected_ms as i64, name: player.name }
        }

        fn apply(&mut self, event: SlotEvent) {
            match event.kind {
                SlotEventKind::Heartbeat | SlotEventKind::Waiting | SlotEventKind::Rotate => return,
                SlotEventKind::Poll => {
                    assert_eq!(Some(event.seq), self.seq, "poll seq should match the last event");
                    self.polls += 1;
                    return;
                }
                SlotEventKind::Snapshot => {}
                _ => assert_eq!(Some(event.seq), self.seq.map(|s| s + 1), "seq gap"),
            }
            self.seq = Some(event.seq);
            match event.kind {
                SlotEventKind::Snapshot => {
                    self.players = event.players.unwrap().into_iter().map(|p| self.track(p)).collect();
                    self.meta = event.meta;
                    self.snapshots += 1;
                }
                SlotEventKind::Join => {
                    let player = self.track(event.player.unwrap());
                    self.players.push(player);
                }
                SlotEventKind::Leave => {
                    let gone = self.track(event.player.unwrap());
                    let at = (0..self.players.len())
                        .filter(|&i| self.players[i].name == gone.name)
                        .min_by_key(|&i| (self.players[i].since - gone.since).abs())
                        .expect("leave of unknown player");
                    self.players.remove(at);
                }
                SlotEventKind::Meta => self.meta = event.meta,
                SlotEventKind::Poll | SlotEventKind::Heartbeat | SlotEventKind::Waiting | SlotEventKind::Rotate => unreachable!(),
            }
        }

        /// Names with connect times rounded to the second, sorted.
        fn sorted(&self) -> Vec<(String, i64)> {
            let mut players: Vec<_> = self.players.iter()
                .map(|p| (p.name.clone(), (p.since as f64 / 1000.0).round() as i64))
                .collect();
            players.sort();
            players
        }

        fn names(&self) -> Vec<String> {
            self.sorted().into_iter().map(|(name, _)| name).collect()
        }
    }

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    async fn next(receiver: &mut broadcast::Receiver<SlotEvent>) -> SlotEvent {
        tokio::time::timeout(Duration::from_secs(60), receiver.recv()).await
            .expect("an event within a minute of virtual time")
            .expect("channel open")
    }

    #[tokio::test(start_paused = true)]
    async fn two_watchers_share_one_poller_and_it_stops_when_both_leave() {
        let hub = Arc::new(SlotWatchHub::with_prober(Scripted::new(vec![Some(&[("Ann", 0)])])));
        let (_, mut first, _) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        let (_, second, _) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        assert_eq!(hub.watching(), 1);
        assert_eq!(next(&mut first).await.kind, SlotEventKind::Snapshot);

        drop(first);
        drop(second);
        tokio::time::sleep(Duration::from_millis(POLL_MAX_MS + 100)).await;
        assert_eq!(hub.watching(), 0, "poller should remove itself once nobody listens");
    }

    #[tokio::test(start_paused = true)]
    async fn snapshot_then_diffs_replay_to_the_true_list_and_times() {
        let start = Instant::now();
        let script: Vec<Option<&[Entry]>> = vec![
            Some(&[("Ann", -3600), ("Bob", -600), ("Bob", -60)]),
            Some(&[("Ann", -3600), ("Bob", -600), ("Bob", -60)]),
            Some(&[("Ann", -3600), ("Bob", -60), ("", 1)]),
            Some(&[("Ann", -3600), ("Bob", -60), ("Cid", 1)]),
            Some(&[("Bob", -60), ("Cid", 1)]),
        ];
        let hub = Arc::new(SlotWatchHub::with_prober(Scripted::new(script)));
        let (_, mut receiver, initial) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        assert!(initial.is_none(), "no snapshot before the first poll");

        let mut client = Client::new(start);
        let snapshot = next(&mut receiver).await;
        assert_eq!(snapshot.kind, SlotEventKind::Snapshot);
        client.apply(snapshot);
        assert_eq!(client.sorted(), vec![("Ann".into(), -3600), ("Bob".into(), -600), ("Bob".into(), -60)]);
        assert_eq!(client.meta.as_ref().unwrap().max_players, 4);

        while client.names() != names(&["Bob", "Cid"]) {
            client.apply(next(&mut receiver).await);
        }
        assert_eq!(client.sorted()[0], ("Bob".into(), -60), "the Bob who connected first is the one who left");
        assert!(client.polls >= 3, "every answered poll after the first sends a poll event");
        assert_eq!(client.snapshots, 1, "steady times need no resync");

        // A late watcher's snapshot lines up with what the first one built from diffs. Nothing
        // awaits between draining and subscribing, so the poller cannot slip an event in.
        loop {
            match receiver.try_recv() {
                Ok(event) => client.apply(event),
                Err(TryRecvError::Empty) => break,
                Err(e) => panic!("receiver failed: {e}"),
            }
        }
        let (_, _late, late_snapshot) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        let late_snapshot = late_snapshot.expect("ready by now");
        assert!(late_snapshot.polled_ms_ago.is_some_and(|age| age <= POLL_MAX_MS), "snapshot says how fresh it is");
        let mut late = Client::new(start);
        late.apply(late_snapshot);
        assert_eq!(late.sorted(), client.sorted());
        assert_eq!(late.seq, client.seq);
        assert_eq!(late.meta, client.meta);
    }

    #[tokio::test(start_paused = true)]
    async fn a_restarted_clock_resends_a_snapshot() {
        let start = Instant::now();
        let script: Vec<Option<&[Entry]>> = vec![Some(&[("Ann", -3600), ("Bob", -60)]), Some(&[("Ann", 0), ("Bob", 0)])];
        let hub = Arc::new(SlotWatchHub::with_prober(Scripted::new(script)));
        let (_, mut receiver, _) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        let mut client = Client::new(start);
        client.apply(next(&mut receiver).await);
        assert_eq!(client.sorted(), vec![("Ann".into(), -3600), ("Bob".into(), -60)]);

        let event = next(&mut receiver).await;
        assert_eq!(event.kind, SlotEventKind::Snapshot, "a jump in connect times resyncs everyone");
        client.apply(event);
        assert_eq!(client.sorted(), vec![("Ann".into(), 0), ("Bob".into(), 0)]);
    }

    #[tokio::test(start_paused = true)]
    async fn unreachable_server_goes_offline_with_an_empty_snapshot() {
        let hub = Arc::new(SlotWatchHub::with_prober(Scripted::new(vec![None])));
        let (_, mut receiver, _) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        let event = next(&mut receiver).await;
        assert_eq!(event.kind, SlotEventKind::Snapshot);
        assert_eq!(event.players, Some(vec![]));
        assert!(!event.meta.unwrap().online);
        assert_eq!(event.polled_ms_ago, None, "a server that never answered has no poll age");
    }

    #[tokio::test(start_paused = true)]
    async fn hidden_list_reports_the_info_count() {
        struct Hidden;
        impl Prober for Hidden {
            fn info(&self, _: SocketAddr) -> BoxFuture<'static, Result<A2sInfo, A2sError>> {
                Box::pin(async { Ok(A2sInfo { map: "ze_test".into(), players: 10, max_players: 64, bots: 0 }) })
            }
            fn players(&self, _: SocketAddr) -> BoxFuture<'static, Result<Vec<A2sPlayer>, A2sError>> {
                Box::pin(async { Err(A2sError::Timeout) })
            }
        }
        let hub = Arc::new(SlotWatchHub::with_prober(Arc::new(Hidden)));
        let (_, mut receiver, _) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        let event = next(&mut receiver).await;
        assert_eq!(event.players, Some(vec![]));
        let meta = event.meta.unwrap();
        assert!(meta.online);
        assert_eq!((meta.players, meta.max_players), (10, 64));
    }

    #[test]
    fn tickets_round_trip_only_for_their_server_and_secret() {
        let ticket = issue_ticket(b"secret", 76561198000000001, Some("Ann".into()), "srv-1");
        assert_eq!(read_ticket(b"secret", &ticket, "srv-1"), Some(Waiter { user_id: Some(76561198000000001), name: Some("Ann".into()) }));
        assert_eq!(read_ticket(b"secret", &ticket, "srv-2"), None, "a ticket is for one server");
        assert_eq!(read_ticket(b"other", &ticket, "srv-1"), None, "forged with another secret");
        assert_eq!(read_ticket(b"secret", "not.a.ticket", "srv-1"), None);
    }

    #[test]
    fn a_ticket_is_not_a_login() {
        let ticket = issue_ticket(b"secret", 1, Some("Ann".into()), "srv-1");
        let mut session = Validation::default();
        session.set_issuer(&[crate::core::utils::ISSUER]);
        assert!(decode::<serde_json::Value>(&ticket, &DecodingKey::from_secret(b"secret"), &session).is_err());
    }

    async fn next_of(receiver: &mut broadcast::Receiver<SlotEvent>, kind: SlotEventKind) -> SlotEvent {
        loop {
            let event = next(receiver).await;
            if event.kind == kind { return event; }
        }
    }

    #[tokio::test(start_paused = true)]
    async fn waiting_list_counts_users_once_and_hides_anonymized_names() {
        let hub = Arc::new(SlotWatchHub::with_prober(Scripted::new(vec![Some(&[("Ann", 0)])])));
        let (watch, mut receiver, _) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        let ann = Waiter { user_id: Some(1), name: Some("Ann".into()) };
        let _tab_one = watch.add_waiter(Some("tab-aaaaaaaa"), ann.clone());
        let _tab_two = watch.add_waiter(Some("tab-bbbbbbbb"), ann);
        let _hidden = watch.add_waiter(None, Waiter { user_id: Some(2), name: None });
        let guest = watch.add_waiter(Some("x"), Waiter::default());

        let snapshot = next_of(&mut receiver, SlotEventKind::Snapshot).await;
        assert_eq!(snapshot.waiting, Some(SlotWaiting { names: vec!["Ann".into()], anonymous: 2 }), "snapshots carry the list");

        let left_at = Instant::now();
        drop(guest);
        let event = next_of(&mut receiver, SlotEventKind::Waiting).await;
        assert!(left_at.elapsed() >= WAITER_GRACE, "a waiter stays listed through the grace period");
        assert_eq!(event.waiting, Some(SlotWaiting { names: vec!["Ann".into()], anonymous: 1 }), "leaving tells everyone");
    }

    #[tokio::test(start_paused = true)]
    async fn a_reconnecting_tab_never_blinks_off_the_list() {
        let hub = Arc::new(SlotWatchHub::with_prober(Scripted::new(vec![Some(&[("Ann", 0)])])));
        let (watch, mut receiver, _) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        let first = watch.add_waiter(Some("0f6c2a1e-tab"), Waiter::default());
        next_of(&mut receiver, SlotEventKind::Snapshot).await;

        drop(first);
        tokio::time::sleep(Duration::from_secs(1)).await;
        let _second = watch.add_waiter(Some("0f6c2a1e-tab"), Waiter::default());
        tokio::time::sleep(WAITER_GRACE * 2).await;

        loop {
            match receiver.try_recv() {
                Ok(event) => assert_ne!(event.kind, SlotEventKind::Waiting, "the list never changed"),
                Err(TryRecvError::Empty) => break,
                Err(e) => panic!("receiver failed: {e}"),
            }
        }
        let (_, now) = watch.subscribe();
        assert_eq!(now.unwrap().waiting, Some(SlotWaiting { names: vec![], anonymous: 1 }), "still one waiter, not two or none");
    }

    #[tokio::test]
    async fn closing_a_stream_by_its_connection_id() {
        let hub = Arc::new(SlotWatchHub::with_prober(Scripted::new(vec![Some(&[("Ann", 0)])])));
        let stream = hub.open_stream("1", "conn-aaaaaaaa");
        assert!(!hub.close("2", "conn-aaaaaaaa"), "ids are per server");
        assert!(!hub.close("1", "conn-bbbbbbbb"), "an unknown id closes nothing");
        assert!(hub.close("1", "conn-aaaaaaaa"));
        tokio::time::timeout(Duration::from_secs(1), stream.closed.notified()).await
            .expect("a close sent before the stream waits is kept, not lost");

        drop(stream);
        assert!(!hub.close("1", "conn-aaaaaaaa"), "an ended stream is unlisted");
    }

    #[tokio::test]
    async fn an_old_stream_ending_does_not_unlist_a_newer_one_with_its_id() {
        let hub = Arc::new(SlotWatchHub::with_prober(Scripted::new(vec![Some(&[("Ann", 0)])])));
        let old = hub.open_stream("1", "conn-aaaaaaaa");
        let new = hub.open_stream("1", "conn-aaaaaaaa");
        drop(old);
        assert!(hub.close("1", "conn-aaaaaaaa"));
        tokio::time::timeout(Duration::from_secs(1), new.closed.notified()).await.expect("the newer stream is told");
    }
}
