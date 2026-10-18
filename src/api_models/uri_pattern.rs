use std::cmp::Ordering;

#[derive(Debug, Clone, PartialEq, Eq)]
enum Segment {
    Literal(&'static str),
    Param,
}

impl Segment {
    fn rank(&self) -> u8 {
        match self {
            Segment::Literal(_) => 1,
            Segment::Param => 0,
        }
    }
}

fn split_segments(path: &str) -> impl Iterator<Item = &str> {
    path.trim_start_matches('/')
        .trim_end_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
}

#[derive(Debug, Clone)]
pub struct RoutePattern {
    uri: &'static str,
    segments: Vec<Segment>,
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

impl Ord for RoutePattern {
    fn cmp(&self, other: &Self) -> Ordering {
        self.segments
            .iter()
            .map(Segment::rank)
            .cmp(other.segments.iter().map(Segment::rank))
            .then_with(|| self.uri.cmp(other.uri))
    }
}

pub struct PatternTable {
    patterns: Vec<RoutePattern>,
}

impl PatternTable {
    pub fn from_spec(spec: &str, extra: &[&'static str]) -> Self {
        let spec: serde_json::Value = serde_json::from_str(spec).expect("poem-openapi emits valid JSON");
        let mut patterns: Vec<RoutePattern> = spec["paths"]
            .as_object()
            .into_iter()
            .flat_map(|paths| paths.keys())
            .map(|path| RoutePattern::new(path.clone().leak()))
            .chain(extra.iter().map(|path| RoutePattern::new(path)))
            .collect();

        patterns.sort_by(|a, b| b.cmp(a));
        PatternTable { patterns }
    }

    pub fn find(&self, path: &str) -> Option<&RoutePattern> {
        self.patterns.iter().find(|pattern| pattern.is_match(path))
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

    #[test]
    fn param_does_not_span_a_slash() {
        let pattern = RoutePattern::new("/maps/{map_name}/3d");
        assert!(pattern.is_match("/maps/ze_test/3d"));
        assert!(!pattern.is_match("/maps/ze/test/3d"));
    }

    #[test]
    fn longer_candidate_does_not_panic() {
        let pattern = RoutePattern::new("/a/{b}/c/{d}/e");
        assert!(!pattern.is_match("/a/1/c/2/e/extra/more"));
        assert!(!pattern.is_match("/a/1/c/2/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t"));

        let real = RoutePattern::new("/servers/{server_id}/maps/{map_name}/info");
        assert!(!real.is_match("/servers/1/maps/a/b/c/d/e/f/g/h"));
    }

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
