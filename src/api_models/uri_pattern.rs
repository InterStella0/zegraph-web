//! Matching of request paths against the OpenAPI-style route patterns declared by each router.
//!
//! Used only by [`PatternLogger`](crate::api_models::common::PatternLogger), which needs the
//! pattern that serves a request so the tracing span can carry a stable `transaction_name` rather
//! than a distinct one per concrete URL.
//!
//! This replaces the `uri-pattern-matcher` crate, whose `is_match` indexed its parts vector with
//! the candidate's segment index and no bounds check: a path with more segments than the pattern
//! panicked, and one with fewer matched as a prefix. Its `Eq`/`Ord` also compared a specificity
//! score rather than the patterns themselves, so two unrelated routes with the same wildcard layout
//! compared equal.

use std::cmp::Ordering;
use std::collections::HashMap;
use std::sync::Arc;

use crate::api_models::common::UriPatternExt;

#[derive(Debug, Clone, PartialEq, Eq)]
enum Segment {
    Literal(&'static str),
    Param,
}

impl Segment {
    /// Ranks a segment for specificity comparison: a literal is more specific than a wildcard.
    fn rank(&self) -> u8 {
        match self {
            Segment::Literal(_) => 1,
            Segment::Param => 0,
        }
    }
}

/// Splits a path into its meaningful segments, dropping the leading empty segment and one optional
/// trailing empty one so `/a/b` and `/a/b/` are the same path.
fn split_segments(path: &str) -> impl Iterator<Item = &str> {
    path.trim_start_matches('/')
        .trim_end_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
}

/// A single route pattern, e.g. `/servers/{server_id}/maps/{map_name}/info`.
///
/// Holds `&'static str` rather than a lifetime parameter because every pattern in the codebase is a
/// string literal in a [`UriPatternExt::get_all_patterns`] impl. That is what lets [`PatternTable`]
/// build the whole set once at startup instead of per request.
#[derive(Debug, Clone)]
pub struct RoutePattern {
    uri: &'static str,
    segments: Vec<Segment>,
}

impl From<&'static str> for RoutePattern {
    fn from(uri: &'static str) -> Self {
        Self::new(uri)
    }
}

impl RoutePattern {
    pub fn new(uri: &'static str) -> Self {
        let segments = split_segments(uri)
            .map(|part| {
                if part.starts_with('{') && part.ends_with('}') {
                    Segment::Param
                } else {
                    Segment::Literal(part)
                }
            })
            .collect();
        RoutePattern { uri, segments }
    }

    /// Whether `path` is served by this pattern. Segment counts must agree, so neither a longer nor
    /// a shorter path can match — the two failure modes of the crate this replaced.
    pub fn is_match(&self, path: &str) -> bool {
        let mut candidate = split_segments(path);
        let mut pattern = self.segments.iter();
        loop {
            match (candidate.next(), pattern.next()) {
                (None, None) => return true,
                (Some(c), Some(Segment::Literal(l))) if c == *l => continue,
                (Some(_), Some(Segment::Param)) => continue,
                _ => return false,
            }
        }
    }

    /// The pattern as written, e.g. `/communities/{community_id}/unique_players`. Same syntax the
    /// OpenAPI spec uses for path keys, which is what lets `route_tests` compare the two directly.
    pub fn uri(&self) -> &'static str {
        self.uri
    }
}

impl PartialEq for RoutePattern {
    fn eq(&self, other: &Self) -> bool {
        self.uri == other.uri
    }
}

impl Eq for RoutePattern {}

impl PartialOrd for RoutePattern {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Orders by specificity, most specific greatest: leftmost differing segment decides, with a
/// literal beating a wildcard, then more segments beats fewer. The final `uri` tie-break exists so
/// the order is total and `cmp` returns `Equal` only for identical patterns, keeping it consistent
/// with `Eq`.
impl Ord for RoutePattern {
    fn cmp(&self, other: &Self) -> Ordering {
        self.segments
            .iter()
            .map(Segment::rank)
            .cmp(other.segments.iter().map(Segment::rank))
            .then_with(|| self.uri.cmp(other.uri))
    }
}

/// Every registered pattern, sorted once so that the first match found for a path is also the most
/// specific one.
pub struct PatternTable {
    patterns: Vec<RoutePattern>,
}

impl PatternTable {
    pub fn new(routers: &[Arc<dyn UriPatternExt + Send + Sync>]) -> Self {
        let mut patterns: Vec<RoutePattern> = routers
            .iter()
            .flat_map(|api| api.get_all_patterns())
            .collect();

        warn_on_duplicates(&patterns);

        // Descending, so `find` returns the most specific match and can stop there.
        patterns.sort_by(|a, b| b.cmp(a));
        PatternTable { patterns }
    }

    /// The most specific registered pattern serving `path`, or `None` if no route matches.
    pub fn find(&self, path: &str) -> Option<&RoutePattern> {
        self.patterns.iter().find(|pattern| pattern.is_match(path))
    }
}

/// A pattern listed twice is dead weight the drift test in `route_tests` cannot see: it compares
/// the declared set against the spec as sets, so duplicates cancel out. Cheap enough to check once
/// at startup.
fn warn_on_duplicates(patterns: &[RoutePattern]) {
    let mut seen: HashMap<&str, usize> = HashMap::new();
    for pattern in patterns {
        *seen.entry(pattern.uri()).or_insert(0) += 1;
    }
    for (uri, count) in seen {
        if count > 1 {
            tracing::warn!("Route pattern {uri} is registered {count} times in get_all_patterns()");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn literal_pattern_matches_only_itself() {
        let pattern = RoutePattern::new("/maps/all/3d");
        assert!(pattern.is_match("/maps/all/3d"));
        assert!(!pattern.is_match("/maps/all/2d"));
        assert!(!pattern.is_match("/maps/all"));
    }

    #[test]
    fn params_match_any_single_segment() {
        let pattern = RoutePattern::new("/servers/{server_id}/maps/{map_name}/info");
        assert!(pattern.is_match("/servers/1/maps/ze_test_map_v1/info"));
        assert!(pattern.is_match("/servers/whatever/maps/anything-goes/info"));
        assert!(!pattern.is_match("/servers/1/maps/ze_test_map_v1/analyze"));
    }

    /// A param spans exactly one segment, so a slash inside the candidate is not swallowed by it.
    #[test]
    fn param_does_not_span_a_slash() {
        let pattern = RoutePattern::new("/maps/{map_name}/3d");
        assert!(pattern.is_match("/maps/ze_test/3d"));
        assert!(!pattern.is_match("/maps/ze/test/3d"));
    }

    /// The reported crash: `uri-pattern-matcher` indexed its parts vector with the candidate's
    /// segment index, so any path longer than the pattern panicked with an out-of-bounds index.
    #[test]
    fn longer_candidate_does_not_panic() {
        let pattern = RoutePattern::new("/a/{b}/c/{d}/e");
        assert!(!pattern.is_match("/a/1/c/2/e/extra/more"));
        assert!(!pattern.is_match("/a/1/c/2/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t"));

        // Against a real pattern, with a path longer than any route the app registers.
        let real = RoutePattern::new("/servers/{server_id}/maps/{map_name}/info");
        assert!(!real.is_match("/servers/1/maps/a/b/c/d/e/f/g/h"));
    }

    /// The other half of the same bug: matching stopped at the candidate's end, so a shorter path
    /// matched a longer pattern as a prefix and got labelled with the wrong route.
    #[test]
    fn shorter_candidate_is_not_a_prefix_match() {
        let pattern = RoutePattern::new("/servers/{server_id}/maps/autocomplete");
        assert!(!pattern.is_match("/servers/1/maps"));
        assert!(!pattern.is_match("/servers/1"));
        assert!(!pattern.is_match("/"));
    }

    #[test]
    fn trailing_slash_is_ignored() {
        let pattern = RoutePattern::new("/servers/{server_id}/maps");
        assert!(pattern.is_match("/servers/1/maps/"));
        assert!(pattern.is_match("/servers/1/maps"));
    }

    #[test]
    fn empty_paths_match_nothing_registered() {
        let pattern = RoutePattern::new("/health");
        assert!(!pattern.is_match("/"));
        assert!(!pattern.is_match(""));
    }

    /// The replaced crate compared a specificity *score*, which made unrelated routes with the same
    /// wildcard layout compare equal — its own test asserted `/a/{b}/{c}/d == /api/{r}/{id}/details`.
    #[test]
    fn equality_is_pattern_identity_not_shape() {
        let a = RoutePattern::new("/a/{b}/{c}/d");
        let b = RoutePattern::new("/api/{resource}/{id}/details");
        assert_ne!(a, b);
        assert_ne!(a.cmp(&b), Ordering::Equal);
        assert_eq!(a, RoutePattern::new("/a/{b}/{c}/d"));
        assert_eq!(a.cmp(&RoutePattern::new("/a/{b}/{c}/d")), Ordering::Equal);
    }

    #[test]
    fn literals_outrank_params_left_to_right() {
        let literal = RoutePattern::new("/servers/{server_id}/maps/autocomplete");
        let param = RoutePattern::new("/servers/{server_id}/maps/{map_name}");
        assert!(literal > param);

        let early = RoutePattern::new("/maps/all/3d");
        let late = RoutePattern::new("/maps/{map_name}/3d");
        assert!(early > late);
    }

    fn table(patterns: &'static [&'static str]) -> PatternTable {
        let mut patterns: Vec<RoutePattern> = patterns.iter().map(|p| RoutePattern::new(p)).collect();
        patterns.sort_by(|a, b| b.cmp(a));
        PatternTable { patterns }
    }

    /// Real `MapApi` patterns that overlap: the concrete route must win over the wildcard one.
    #[test]
    fn table_resolves_to_the_most_specific_match() {
        let table = table(&[
            "/servers/{server_id}/maps",
            "/servers/{server_id}/maps/autocomplete",
            "/servers/{server_id}/maps/{map_name}/info",
            "/servers/{server_id}/maps/3d",
            "/maps/all/3d",
            "/maps/{map_name}/3d",
        ]);

        assert_eq!(
            table.find("/servers/1/maps/autocomplete").map(RoutePattern::uri),
            Some("/servers/{server_id}/maps/autocomplete")
        );
        assert_eq!(
            table.find("/servers/1/maps/3d").map(RoutePattern::uri),
            Some("/servers/{server_id}/maps/3d")
        );
        assert_eq!(
            table.find("/maps/all/3d").map(RoutePattern::uri),
            Some("/maps/all/3d")
        );
        assert_eq!(
            table.find("/maps/ze_test_map_v1/3d").map(RoutePattern::uri),
            Some("/maps/{map_name}/3d")
        );
        assert_eq!(
            table.find("/servers/1/maps/ze_test_map_v1/info").map(RoutePattern::uri),
            Some("/servers/{server_id}/maps/{map_name}/info")
        );
    }

    #[test]
    fn table_returns_none_for_unregistered_paths() {
        let table = table(&[
            "/servers/{server_id}/maps",
            "/servers/{server_id}/maps/{map_name}/info",
        ]);
        assert!(table.find("/nonsense").is_none());
        assert!(table.find("/servers/1/maps/a/b/c/d/e/f/g/h").is_none());
        assert!(table.find("/").is_none());
    }
}
