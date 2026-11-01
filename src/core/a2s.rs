//! Minimal Source-engine A2S client: `A2S_INFO` for slot counts and `A2S_PLAYER` for the names of
//! everyone on the server. Only what auto join needs; see
//! <https://developer.valvesoftware.com/wiki/Server_queries>.

use std::fmt::{Display, Formatter};
use std::net::SocketAddr;
use std::time::Duration;
use tokio::net::UdpSocket;
use tokio::time::timeout;

/// Budget for one query, including the challenge round trip and every split packet.
pub const QUERY_TIMEOUT: Duration = Duration::from_millis(1500);

const SIMPLE_HEADER: [u8; 4] = [0xFF; 4];
const SPLIT_HEADER: [u8; 4] = [0xFE, 0xFF, 0xFF, 0xFF];
const INFO_REQUEST: &[u8] = b"\xFF\xFF\xFF\xFFTSource Engine Query\0";
const PLAYER_REQUEST: [u8; 5] = [0xFF, 0xFF, 0xFF, 0xFF, 0x55];
const NO_CHALLENGE: [u8; 4] = [0xFF; 4];

const TYPE_CHALLENGE: u8 = 0x41;
const TYPE_INFO: u8 = 0x49;
const TYPE_PLAYER: u8 = 0x44;

/// Servers may answer a challenged request with yet another challenge; give up after this many.
const MAX_CHALLENGES: usize = 3;
/// A split reply can be at most this many packets (a full 64-slot list is 2–3).
const MAX_SPLIT_PACKETS: u8 = 32;

#[derive(Debug)]
pub enum A2sError {
    Io(std::io::Error),
    Timeout,
    Malformed(&'static str),
    UnexpectedType(u8),
    Compressed,
    Unresolved,
}

impl Display for A2sError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            A2sError::Io(e) => write!(f, "io error: {e}"),
            A2sError::Timeout => write!(f, "timed out"),
            A2sError::Malformed(what) => write!(f, "malformed reply: {what}"),
            A2sError::UnexpectedType(t) => write!(f, "unexpected reply type 0x{t:02X}"),
            A2sError::Compressed => write!(f, "compressed split replies are not supported"),
            A2sError::Unresolved => write!(f, "server address did not resolve"),
        }
    }
}

impl From<std::io::Error> for A2sError {
    fn from(e: std::io::Error) -> Self {
        A2sError::Io(e)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct A2sInfo {
    pub map: String,
    pub players: u8,
    pub max_players: u8,
    pub bots: u8,
}

pub async fn query_info(addr: SocketAddr) -> Result<A2sInfo, A2sError> {
    let reply = query(addr, |challenge| {
        let mut request = INFO_REQUEST.to_vec();
        if let Some(challenge) = challenge {
            request.extend_from_slice(&challenge);
        }
        request
    }).await?;
    parse_info(&reply)
}

/// Names of everyone on the server, in server order. Players still connecting have an empty name
/// but are kept: they hold a slot.
pub async fn query_players(addr: SocketAddr) -> Result<Vec<String>, A2sError> {
    let reply = query(addr, |challenge| {
        let mut request = PLAYER_REQUEST.to_vec();
        request.extend_from_slice(&challenge.unwrap_or(NO_CHALLENGE));
        request
    }).await?;
    parse_players(&reply)
}

/// Sends `build(None)`, answers challenges with `build(Some(challenge))`, and returns the final
/// reply with its `FF FF FF FF` header stripped (so it starts with the type byte).
async fn query(
    addr: SocketAddr,
    build: impl Fn(Option<[u8; 4]>) -> Vec<u8>,
) -> Result<Vec<u8>, A2sError> {
    let exchange = async {
        let bind: SocketAddr = if addr.is_ipv4() { "0.0.0.0:0" } else { "[::]:0" }
            .parse()
            .expect("static bind address");
        let socket = UdpSocket::bind(bind).await?;
        socket.connect(addr).await?;

        let mut request = build(None);
        for _ in 0..=MAX_CHALLENGES {
            socket.send(&request).await?;
            let reply = receive(&socket).await?;
            match reply.first() {
                Some(&TYPE_CHALLENGE) => {
                    let challenge: [u8; 4] = reply.get(1..5)
                        .and_then(|bytes| bytes.try_into().ok())
                        .ok_or(A2sError::Malformed("short challenge"))?;
                    request = build(Some(challenge));
                }
                Some(_) => return Ok(reply),
                None => return Err(A2sError::Malformed("empty reply")),
            }
        }
        Err(A2sError::Malformed("too many challenges"))
    };
    timeout(QUERY_TIMEOUT, exchange).await.map_err(|_| A2sError::Timeout)?
}

/// Reads one logical reply, reassembling split packets.
async fn receive(socket: &UdpSocket) -> Result<Vec<u8>, A2sError> {
    let mut buf = vec![0u8; 65_535];
    let mut split: Vec<Vec<u8>> = Vec::new();
    loop {
        let n = socket.recv(&mut buf).await?;
        let packet = &buf[..n];
        if let Some(payload) = packet.strip_prefix(&SIMPLE_HEADER) {
            return Ok(payload.to_vec());
        }
        if !packet.starts_with(&SPLIT_HEADER) {
            return Err(A2sError::Malformed("unknown packet header"));
        }
        split.push(packet.to_vec());
        if split.len() > MAX_SPLIT_PACKETS as usize * 2 {
            return Err(A2sError::Malformed("too many split packets"));
        }
        if let Some(reply) = reassemble(&split)? {
            return Ok(reply);
        }
    }
}

struct SplitPacket<'a> {
    id: i32,
    total: u8,
    number: u8,
    payload: &'a [u8],
}

/// Header after `FE FF FF FF`: id i32, total u8, number u8, then (on every current game) a u16
/// max packet size. Old protocol-7 CS:S omits the size, so the layout is picked by whichever one
/// makes packet 0's payload start with `FF FF FF FF`.
fn parse_split(packet: &[u8], with_size: bool) -> Result<SplitPacket<'_>, A2sError> {
    let body = packet.strip_prefix(&SPLIT_HEADER).ok_or(A2sError::Malformed("not a split packet"))?;
    let header_len = if with_size { 8 } else { 6 };
    if body.len() < header_len {
        return Err(A2sError::Malformed("short split header"));
    }
    let id = i32::from_le_bytes(body[0..4].try_into().expect("4 bytes"));
    if id < 0 {
        return Err(A2sError::Compressed);
    }
    Ok(SplitPacket { id, total: body[4], number: body[5], payload: &body[header_len..] })
}

/// Joins split packets into one reply (header stripped, starting with the type byte), or `None`
/// while packets are still missing. Packets from another reply id are ignored.
pub fn reassemble(packets: &[Vec<u8>]) -> Result<Option<Vec<u8>>, A2sError> {
    let with_size = match packets.iter()
        .find(|p| p.get(9) == Some(&0))
    {
        Some(first) => match first.get(12..16) {
            Some(bytes) if bytes == SIMPLE_HEADER => true,
            _ if first.get(10..14) == Some(&SIMPLE_HEADER[..]) => false,
            _ => true,
        },
        None => return Ok(None),
    };

    let parsed = packets.iter()
        .map(|p| parse_split(p, with_size))
        .collect::<Result<Vec<_>, _>>()?;
    let Some(first) = parsed.iter().find(|p| p.number == 0) else {
        return Ok(None);
    };
    let (id, total) = (first.id, first.total);
    if total == 0 || total > MAX_SPLIT_PACKETS {
        return Err(A2sError::Malformed("bad split packet count"));
    }

    let mut parts: Vec<Option<&[u8]>> = vec![None; total as usize];
    for packet in parsed.iter().filter(|p| p.id == id) {
        if let Some(slot) = parts.get_mut(packet.number as usize) {
            *slot = Some(packet.payload);
        }
    }
    if parts.iter().any(Option::is_none) {
        return Ok(None);
    }
    let joined: Vec<u8> = parts.into_iter().flatten().flatten().copied().collect();
    joined.strip_prefix(&SIMPLE_HEADER)
        .map(|reply| Some(reply.to_vec()))
        .ok_or(A2sError::Malformed("split reply missing inner header"))
}

struct Reader<'a> {
    data: &'a [u8],
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], A2sError> {
        if self.data.len() < n {
            return Err(A2sError::Malformed("truncated"));
        }
        let (head, rest) = self.data.split_at(n);
        self.data = rest;
        Ok(head)
    }

    fn u8(&mut self) -> Result<u8, A2sError> {
        Ok(self.take(1)?[0])
    }

    fn cstring(&mut self) -> Result<String, A2sError> {
        let end = self.data.iter().position(|&b| b == 0)
            .ok_or(A2sError::Malformed("unterminated string"))?;
        let text = String::from_utf8_lossy(&self.data[..end]).into_owned();
        self.data = &self.data[end + 1..];
        Ok(text)
    }
}

/// Parses an `A2S_INFO` reply that starts with the `0x49` type byte.
pub fn parse_info(reply: &[u8]) -> Result<A2sInfo, A2sError> {
    let mut r = Reader { data: reply };
    let kind = r.u8()?;
    if kind != TYPE_INFO {
        return Err(A2sError::UnexpectedType(kind));
    }
    r.u8()?; // protocol
    r.cstring()?; // name
    let map = r.cstring()?;
    r.cstring()?; // folder
    r.cstring()?; // game
    r.take(2)?; // app id
    let players = r.u8()?;
    let max_players = r.u8()?;
    let bots = r.u8()?;
    Ok(A2sInfo { map, players, max_players, bots })
}

/// Parses an `A2S_PLAYER` reply that starts with the `0x44` type byte, keeping only names.
pub fn parse_players(reply: &[u8]) -> Result<Vec<String>, A2sError> {
    let mut r = Reader { data: reply };
    let kind = r.u8()?;
    if kind != TYPE_PLAYER {
        return Err(A2sError::UnexpectedType(kind));
    }
    let count = r.u8()?;
    let mut names = Vec::with_capacity(count as usize);
    for _ in 0..count {
        if r.data.is_empty() {
            // Some servers overstate the count; what they sent is still the list.
            break;
        }
        r.u8()?; // index
        names.push(r.cstring()?);
        r.take(4)?; // score
        r.take(4)?; // duration
    }
    Ok(names)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn info_reply(map: &str, players: u8, max_players: u8) -> Vec<u8> {
        let mut reply = vec![TYPE_INFO, 17];
        for text in ["ZE Server", map, "csgo", "Counter-Strike: Global Offensive"] {
            reply.extend_from_slice(text.as_bytes());
            reply.push(0);
        }
        reply.extend_from_slice(&730i16.to_le_bytes());
        reply.extend_from_slice(&[players, max_players, 0, b'd', b'l', 0, 1]);
        reply.extend_from_slice(b"1.38.0.0\0");
        reply
    }

    pub(crate) fn player_reply(names: &[&str]) -> Vec<u8> {
        let mut reply = vec![TYPE_PLAYER, names.len() as u8];
        for (index, name) in names.iter().enumerate() {
            reply.push(index as u8);
            reply.extend_from_slice(name.as_bytes());
            reply.push(0);
            reply.extend_from_slice(&42i32.to_le_bytes());
            reply.extend_from_slice(&123.5f32.to_le_bytes());
        }
        reply
    }

    fn split(reply: &[u8], id: i32, chunk: usize, with_size: bool) -> Vec<Vec<u8>> {
        let mut whole = SIMPLE_HEADER.to_vec();
        whole.extend_from_slice(reply);
        let chunks: Vec<&[u8]> = whole.chunks(chunk).collect();
        chunks.iter().enumerate().map(|(number, payload)| {
            let mut packet = SPLIT_HEADER.to_vec();
            packet.extend_from_slice(&id.to_le_bytes());
            packet.push(chunks.len() as u8);
            packet.push(number as u8);
            if with_size {
                packet.extend_from_slice(&1248u16.to_le_bytes());
            }
            packet.extend_from_slice(payload);
            packet
        }).collect()
    }

    #[test]
    fn parses_info() {
        let info = parse_info(&info_reply("ze_frozentemple_b8_3", 63, 64)).unwrap();
        assert_eq!(info, A2sInfo { map: "ze_frozentemple_b8_3".into(), players: 63, max_players: 64, bots: 0 });
    }

    #[test]
    fn parses_players_keeping_empty_and_duplicate_names() {
        let names = parse_players(&player_reply(&["Bob", "", "Bob", "ゾンビ"])).unwrap();
        assert_eq!(names, vec!["Bob", "", "Bob", "ゾンビ"]);
    }

    #[test]
    fn player_count_overstated_is_tolerated() {
        let mut reply = player_reply(&["Alice"]);
        reply[1] = 5;
        assert_eq!(parse_players(&reply).unwrap(), vec!["Alice"]);
    }

    #[test]
    fn truncated_replies_are_errors() {
        let reply = player_reply(&["Alice", "Bob"]);
        assert!(matches!(parse_players(&reply[..reply.len() - 3]), Err(A2sError::Malformed(_))));
        let info = info_reply("ze_map", 1, 64);
        assert!(matches!(parse_info(&info[..12]), Err(A2sError::Malformed(_))));
    }

    #[test]
    fn wrong_type_is_rejected() {
        let challenge = [TYPE_CHALLENGE, 1, 2, 3, 4];
        assert!(matches!(parse_info(&challenge), Err(A2sError::UnexpectedType(TYPE_CHALLENGE))));
        assert!(matches!(parse_players(&challenge), Err(A2sError::UnexpectedType(TYPE_CHALLENGE))));
    }

    #[test]
    fn reassembles_split_players_in_any_order() {
        let names: Vec<String> = (0..64).map(|i| format!("player with a long name {i}")).collect();
        let refs: Vec<&str> = names.iter().map(String::as_str).collect();
        let reply = player_reply(&refs);
        for with_size in [true, false] {
            let mut packets = split(&reply, 7, 1200, with_size);
            assert!(packets.len() > 1, "fixture should need more than one packet");
            packets.reverse();
            let last = packets.pop().unwrap();
            assert_eq!(reassemble(&packets).unwrap(), None, "incomplete while a packet is missing");
            packets.push(last);
            let joined = reassemble(&packets).unwrap().expect("all packets present");
            assert_eq!(parse_players(&joined).unwrap(), names);
        }
    }

    #[test]
    fn reassembly_ignores_other_reply_ids() {
        let reply = player_reply(&["Alice", "Bob"]);
        let mut packets = split(&reply, 9, 16, true);
        let mut stray = split(&player_reply(&["Mallory"]), 3, 16, true);
        stray.remove(0);
        packets.splice(1..1, stray);
        let joined = reassemble(&packets).unwrap().unwrap();
        assert_eq!(parse_players(&joined).unwrap(), vec!["Alice", "Bob"]);
    }

    #[test]
    fn compressed_split_is_rejected() {
        let mut packets = split(&player_reply(&["Alice"]), 1, 8, true);
        packets[0][7] |= 0x80;
        assert!(matches!(reassemble(&packets), Err(A2sError::Compressed)));
    }

    /// Manual check against a real server, skipped by default since it needs the internet:
    /// `A2S_ADDR=1.2.3.4:27015 cargo test live_server -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn live_server() {
        let addr: SocketAddr = std::env::var("A2S_ADDR").expect("set A2S_ADDR").parse().unwrap();
        let info = query_info(addr).await.expect("A2S_INFO");
        let names = query_players(addr).await.expect("A2S_PLAYER");
        println!("{info:?}\n{} names: {names:?}", names.len());
    }

    /// Plays a real server's side of the challenge handshake on localhost.
    #[tokio::test]
    async fn answers_the_challenge_then_reads_players() {
        let server = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let addr = server.local_addr().unwrap();
        let fake = tokio::spawn(async move {
            let mut buf = [0u8; 1500];
            let (n, peer) = server.recv_from(&mut buf).await.unwrap();
            assert_eq!(&buf[..n], b"\xFF\xFF\xFF\xFF\x55\xFF\xFF\xFF\xFF");
            server.send_to(b"\xFF\xFF\xFF\xFF\x41\x0A\x0B\x0C\x0D", peer).await.unwrap();
            let (n, peer) = server.recv_from(&mut buf).await.unwrap();
            assert_eq!(&buf[..n], b"\xFF\xFF\xFF\xFF\x55\x0A\x0B\x0C\x0D");
            for packet in split(&player_reply(&["Alice", "Bob"]), 5, 10, true) {
                server.send_to(&packet, peer).await.unwrap();
            }
        });
        assert_eq!(query_players(addr).await.unwrap(), vec!["Alice", "Bob"]);
        fake.await.unwrap();
    }
}
