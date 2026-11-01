//! Real-time player list of a game server for auto join.
//!
//! One poller per server, alive only while at least one SSE client watches it. Each client gets a
//! `snapshot` (every name plus slot counts) and then one `join`/`leave` per name, so it can count
//! free slots and spot its own name itself.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use futures::future::BoxFuture;
use poem_openapi::{Enum, Object};
use rand::{rng, RngExt};
use serde::Serialize;
use tokio::sync::broadcast;
use tokio::sync::Semaphore;
use crate::core::a2s::{self, A2sError, A2sInfo};

const EVENT_BUFFER: usize = 64;
pub(crate) const MAX_SLOT_CLIENTS: usize = 256;

const POLL_MIN_MS: u64 = 500;
const POLL_MAX_MS: u64 = 3000;
/// Max players and the map rarely change, so `A2S_INFO` is refreshed far less often than the list.
const INFO_REFRESH: Duration = Duration::from_secs(15);
/// Consecutive failed polls before the server is reported offline.
const OFFLINE_AFTER: u32 = 3;
const OFFLINE_POLL: Duration = Duration::from_secs(10);

#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[oai(rename_all = "snake_case")]
#[serde(rename_all = "snake_case")]
pub enum SlotEventKind {
    Snapshot,
    Join,
    Leave,
    Meta,
    Heartbeat,
}

#[derive(Object, Clone, Debug, PartialEq, Eq, Default, Serialize)]
pub struct SlotMeta {
    pub max_players: u16,
    /// From `A2S_INFO`. Clients count `names` instead, and fall back to this only when the server
    /// returns no names while reporting players.
    pub players: u16,
    pub online: bool,
    pub map: Option<String>,
}

/// One server-sent event. `seq` increases by exactly one per broadcast event; a client that sees a
/// gap should reconnect for a fresh snapshot. A snapshot carries the `seq` of the last event it
/// already includes.
#[derive(Object, Clone, Debug, PartialEq, Serialize)]
pub struct SlotEvent {
    pub kind: SlotEventKind,
    pub seq: u64,
    #[oai(skip_serializing_if_is_none)]
    pub meta: Option<SlotMeta>,
    /// Every player on the server, `snapshot` only. Duplicates are separate players; an empty name
    /// is a player still connecting.
    #[oai(skip_serializing_if_is_none)]
    pub names: Option<Vec<String>>,
    /// The player who joined or left, `join`/`leave` only.
    #[oai(skip_serializing_if_is_none)]
    pub name: Option<String>,
}

impl SlotEvent {
    fn bare(kind: SlotEventKind, seq: u64) -> Self {
        Self { kind, seq, meta: None, names: None, name: None }
    }

    pub(crate) fn heartbeat(seq: u64) -> Self {
        Self::bare(SlotEventKind::Heartbeat, seq)
    }

    fn named(kind: SlotEventKind, seq: u64, name: String) -> Self {
        Self { name: Some(name), ..Self::bare(kind, seq) }
    }
}

/// Splits the change from `old` to `new` into `(left, joined)`, counting duplicate names
/// separately. Both lists are sorted so the result is deterministic.
pub(crate) fn diff_names(old: &[String], new: &[String]) -> (Vec<String>, Vec<String>) {
    let mut balance: HashMap<&str, i64> = HashMap::new();
    for name in old {
        *balance.entry(name).or_default() += 1;
    }
    for name in new {
        *balance.entry(name).or_default() -= 1;
    }
    let mut left = Vec::new();
    let mut joined = Vec::new();
    for (name, count) in balance {
        let target = if count > 0 { &mut left } else { &mut joined };
        target.extend(std::iter::repeat_n(name.to_string(), count.unsigned_abs() as usize));
    }
    left.sort();
    joined.sort();
    (left, joined)
}

/// What one poll learned. `info` is `None` on ticks that skipped `A2S_INFO`.
pub(crate) struct Probe {
    pub info: Option<A2sInfo>,
    pub names: Vec<String>,
}

pub(crate) trait Prober: Send + Sync + 'static {
    fn info(&self, addr: SocketAddr) -> BoxFuture<'static, Result<A2sInfo, A2sError>>;
    fn players(&self, addr: SocketAddr) -> BoxFuture<'static, Result<Vec<String>, A2sError>>;
}

struct A2sProber;

impl Prober for A2sProber {
    fn info(&self, addr: SocketAddr) -> BoxFuture<'static, Result<A2sInfo, A2sError>> {
        Box::pin(a2s::query_info(addr))
    }

    fn players(&self, addr: SocketAddr) -> BoxFuture<'static, Result<Vec<String>, A2sError>> {
        Box::pin(a2s::query_players(addr))
    }
}

#[derive(Default)]
struct WatchState {
    names: Vec<String>,
    meta: SlotMeta,
    seq: u64,
    /// False until the first poll finishes. Until then nobody gets a snapshot: an empty list would
    /// read as a server with every slot free.
    ready: bool,
}

pub(crate) struct ServerWatch {
    state: Mutex<WatchState>,
    events: broadcast::Sender<SlotEvent>,
}

impl ServerWatch {
    fn new() -> Self {
        let (events, _) = broadcast::channel(EVENT_BUFFER);
        Self { state: Mutex::new(WatchState::default()), events }
    }

    /// A receiver plus the snapshot it starts after, taken under one lock so no event falls
    /// between them or is counted twice. The snapshot is `None` before the first poll; the
    /// receiver then gets a broadcast snapshot once it lands.
    pub(crate) fn subscribe(&self) -> (broadcast::Receiver<SlotEvent>, Option<SlotEvent>) {
        let state = self.state.lock().expect("slot watch state poisoned");
        let receiver = self.events.subscribe();
        (receiver, state.ready.then(|| snapshot_of(&state)))
    }

    pub(crate) fn seq(&self) -> u64 {
        self.state.lock().expect("slot watch state poisoned").seq
    }

    fn broadcast(&self, state: &mut WatchState, build: impl FnOnce(u64) -> SlotEvent) {
        state.seq += 1;
        // No receivers is fine: the poller notices and stops on its next tick.
        let _ = self.events.send(build(state.seq));
    }

    fn apply(&self, meta: SlotMeta, names: Vec<String>) {
        let mut state = self.state.lock().expect("slot watch state poisoned");
        if !state.ready || !state.meta.online {
            state.names = names;
            state.meta = meta;
            state.ready = true;
            let snapshot = snapshot_of(&state);
            self.broadcast(&mut state, |seq| SlotEvent { seq, ..snapshot });
            return;
        }

        let (left, joined) = diff_names(&state.names, &names);
        for name in left {
            self.broadcast(&mut state, |seq| SlotEvent::named(SlotEventKind::Leave, seq, name));
        }
        for name in joined {
            self.broadcast(&mut state, |seq| SlotEvent::named(SlotEventKind::Join, seq, name));
        }
        state.names = names;

        if state.meta != meta {
            state.meta = meta.clone();
            self.broadcast(&mut state, |seq| SlotEvent { meta: Some(meta), ..SlotEvent::bare(SlotEventKind::Meta, seq) });
        }
    }

    fn mark_offline(&self) {
        let mut state = self.state.lock().expect("slot watch state poisoned");
        if state.ready && !state.meta.online {
            return;
        }
        state.names.clear();
        state.meta.online = false;
        state.meta.players = 0;
        state.ready = true;
        let snapshot = snapshot_of(&state);
        self.broadcast(&mut state, |seq| SlotEvent { seq, ..snapshot });
    }
}

fn snapshot_of(state: &WatchState) -> SlotEvent {
    SlotEvent {
        meta: Some(state.meta.clone()),
        names: Some(state.names.clone()),
        ..SlotEvent::bare(SlotEventKind::Snapshot, state.seq)
    }
}

pub(crate) struct SlotWatchHub {
    watches: Mutex<HashMap<String, Arc<ServerWatch>>>,
    pub(crate) clients: Arc<Semaphore>,
    prober: Arc<dyn Prober>,
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
            None => Err(A2sError::Malformed("could not resolve server address")),
        };

        match result {
            Ok(Probe { info, names }) => {
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
                watch.apply(meta, names);
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
/// the server is not returning names (its player count is then all clients have).
async fn probe(prober: &dyn Prober, addr: SocketAddr, last_info: Option<&(Instant, A2sInfo)>) -> Result<Probe, A2sError> {
    let names = prober.players(addr).await;
    let hiding_names = matches!(&names, Ok(names) if names.is_empty())
        && last_info.is_some_and(|(_, info)| info.players > 0);
    let info = match last_info {
        Some((at, _)) if at.elapsed() < INFO_REFRESH && !hiding_names && names.is_ok() => None,
        _ => Some(prober.info(addr).await?),
    };
    // A server that answers INFO but not PLAYER hides its list; count it from INFO instead.
    let names = match names {
        Ok(names) => names,
        Err(e) if info.is_some() => {
            tracing::debug!("A2S_PLAYER failed but A2S_INFO answered, treating the list as hidden: {e}");
            Vec::new()
        }
        Err(e) => return Err(e),
    };
    Ok(Probe { info, names })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::VecDeque;
    use tokio::sync::broadcast::error::TryRecvError;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn diff_counts_duplicates_as_separate_players() {
        let (left, joined) = diff_names(&names(&["Bob"]), &names(&["Bob", "Bob"]));
        assert_eq!((left, joined), (vec![], names(&["Bob"])));
        let (left, joined) = diff_names(&names(&["Bob", "Bob", "Ann"]), &names(&["Bob"]));
        assert_eq!((left, joined), (names(&["Ann", "Bob"]), vec![]));
    }

    #[test]
    fn diff_connecting_player_gets_a_name() {
        let (left, joined) = diff_names(&names(&["Ann", ""]), &names(&["Ann", "Bob"]));
        assert_eq!((left, joined), (names(&[""]), names(&["Bob"])));
    }

    #[test]
    fn diff_unchanged_or_reordered_is_empty() {
        let (left, joined) = diff_names(&names(&["Ann", "Bob"]), &names(&["Bob", "Ann"]));
        assert!(left.is_empty() && joined.is_empty());
    }

    /// Replays scripted player lists; `None` is a failed poll.
    struct Scripted {
        lists: Mutex<VecDeque<Option<Vec<String>>>>,
        max_players: u8,
    }

    impl Scripted {
        fn new(lists: Vec<Option<&[&str]>>) -> Arc<Self> {
            Arc::new(Self {
                lists: Mutex::new(lists.into_iter().map(|l| l.map(names)).collect()),
                max_players: 4,
            })
        }

        fn current(&self) -> Option<Vec<String>> {
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

        fn players(&self, _: SocketAddr) -> BoxFuture<'static, Result<Vec<String>, A2sError>> {
            let list = self.current();
            Box::pin(async move { list.ok_or(A2sError::Timeout) })
        }
    }

    /// Applies events the way the frontend does and checks `seq` has no gaps.
    #[derive(Default)]
    struct Client {
        names: Vec<String>,
        meta: Option<SlotMeta>,
        seq: Option<u64>,
    }

    impl Client {
        fn apply(&mut self, event: SlotEvent) {
            if event.kind == SlotEventKind::Heartbeat {
                return;
            }
            if event.kind != SlotEventKind::Snapshot {
                assert_eq!(Some(event.seq), self.seq.map(|s| s + 1), "seq gap");
            }
            self.seq = Some(event.seq);
            match event.kind {
                SlotEventKind::Snapshot => {
                    self.names = event.names.unwrap();
                    self.meta = event.meta;
                }
                SlotEventKind::Join => self.names.push(event.name.unwrap()),
                SlotEventKind::Leave => {
                    let name = event.name.unwrap();
                    let at = self.names.iter().position(|n| *n == name).expect("leave of unknown name");
                    self.names.remove(at);
                }
                SlotEventKind::Meta => self.meta = event.meta,
                SlotEventKind::Heartbeat => unreachable!(),
            }
        }

        fn sorted(&self) -> Vec<String> {
            let mut names = self.names.clone();
            names.sort();
            names
        }
    }

    async fn next(receiver: &mut broadcast::Receiver<SlotEvent>) -> SlotEvent {
        tokio::time::timeout(Duration::from_secs(60), receiver.recv()).await
            .expect("an event within a minute of virtual time")
            .expect("channel open")
    }

    #[tokio::test(start_paused = true)]
    async fn two_watchers_share_one_poller_and_it_stops_when_both_leave() {
        let hub = Arc::new(SlotWatchHub::with_prober(Scripted::new(vec![Some(&["Ann"])])));
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
    async fn snapshot_then_diffs_replay_to_the_true_list() {
        let script: Vec<Option<&[&str]>> = vec![
            Some(&["Ann", "Bob", "Bob"]),
            Some(&["Ann", "Bob", "Bob"]),
            Some(&["Ann", "Bob", ""]),
            Some(&["Ann", "Bob", "Cid"]),
            Some(&["Bob", "Cid"]),
        ];
        let hub = Arc::new(SlotWatchHub::with_prober(Scripted::new(script)));
        let (_, mut receiver, initial) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        assert!(initial.is_none(), "no snapshot before the first poll");

        let mut client = Client::default();
        let snapshot = next(&mut receiver).await;
        assert_eq!(snapshot.kind, SlotEventKind::Snapshot);
        client.apply(snapshot);
        assert_eq!(client.sorted(), names(&["Ann", "Bob", "Bob"]));
        assert_eq!(client.meta.as_ref().unwrap().max_players, 4);

        while client.sorted() != names(&["Bob", "Cid"]) {
            client.apply(next(&mut receiver).await);
        }

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
        let mut late = Client::default();
        late.apply(late_snapshot.expect("ready by now"));
        assert_eq!(late.sorted(), client.sorted());
        assert_eq!(late.seq, client.seq);
        assert_eq!(late.meta, client.meta);
    }

    #[tokio::test(start_paused = true)]
    async fn unreachable_server_goes_offline_with_an_empty_snapshot() {
        let hub = Arc::new(SlotWatchHub::with_prober(Scripted::new(vec![None])));
        let (_, mut receiver, _) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        let event = next(&mut receiver).await;
        assert_eq!(event.kind, SlotEventKind::Snapshot);
        assert_eq!(event.names, Some(vec![]));
        assert!(!event.meta.unwrap().online);
    }

    #[tokio::test(start_paused = true)]
    async fn hidden_list_reports_the_info_count() {
        struct Hidden;
        impl Prober for Hidden {
            fn info(&self, _: SocketAddr) -> BoxFuture<'static, Result<A2sInfo, A2sError>> {
                Box::pin(async { Ok(A2sInfo { map: "ze_test".into(), players: 10, max_players: 64, bots: 0 }) })
            }
            fn players(&self, _: SocketAddr) -> BoxFuture<'static, Result<Vec<String>, A2sError>> {
                Box::pin(async { Err(A2sError::Timeout) })
            }
        }
        let hub = Arc::new(SlotWatchHub::with_prober(Arc::new(Hidden)));
        let (_, mut receiver, _) = hub.subscribe("1", "127.0.0.1".into(), 27015);
        let event = next(&mut receiver).await;
        assert_eq!(event.names, Some(vec![]));
        let meta = event.meta.unwrap();
        assert!(meta.online);
        assert_eq!((meta.players, meta.max_players), (10, 64));
    }
}
