use std::collections::HashMap;
use std::fmt::Display;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use poem::http::StatusCode;
use poem::{Endpoint, Middleware, Request};
use poem_openapi::{ApiResponse, Object};
use poem_openapi::payload::Json;
use poem_openapi::types::{ParseFromJSON, ToJSON};
use serde::{Deserialize, Serialize};
use crate::api_models::uri_pattern::PatternTable;
pub use crate::api_models::uri_pattern::RoutePattern;
use crate::{AppData, FastCache};
use crate::core::utils::get_server;
use crate::models::servers::DbServer;

pub enum ErrorCode{
    NotFound,
    Conflict,
    BadRequest,
    Forbidden,
    InternalServerError,
    Calculating,
    NotImplemented,
    FailedRetry
}

impl Display for ErrorCode{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ErrorCode::NotFound => write!(f, "!Not found!"),
            ErrorCode::Conflict => write!(f, "!Conflict!"),
            ErrorCode::BadRequest => write!(f, "!BadRequest!"),
            ErrorCode::Forbidden => write!(f, "!Forbidden!"),
            ErrorCode::InternalServerError => write!(f, "!InternalServerError!"),
            ErrorCode::Calculating => write!(f, "!Calculating"),
            ErrorCode::NotImplemented => write!(f, "!NotImplemented!"),
            ErrorCode::FailedRetry => write!(f, "!FailedRetry!"),
        }
    }
}

impl From<ErrorCode> for i32{
    fn from(code: ErrorCode) -> i32 {
        match code {
            ErrorCode::NotFound => 404,
            ErrorCode::BadRequest => 400,
            ErrorCode::Conflict => 409,
            ErrorCode::Forbidden => 403,
            ErrorCode::Calculating => 202,
            ErrorCode::InternalServerError => 500,
            ErrorCode::NotImplemented => 501,
            ErrorCode::FailedRetry => 429,
        }
    }
}

/// The envelope every endpoint in this API responds with, always at HTTP 200.
///
/// `code` carries the real outcome: `0` means success and `data` is populated; any other value
/// (see [`ErrorCode`]) means failure and `data` is `None`, with `msg` explaining why. Callers
/// must check `code`, not the HTTP status, to detect errors.
#[derive(Object)]
pub struct ResponseObject<T: ParseFromJSON + ToJSON + Send + Sync> {
    code: i32,
    msg: String,
    data: Option<T>,
}

impl <T: ParseFromJSON + ToJSON + Send + Sync> ResponseObject<T>{
    pub fn ok(data: T) -> Self {
        Self {
            code: 0,
            msg: "OK".to_string(),
            data: Some(data),
        }
    }
    pub fn err(msg: &str, code: ErrorCode) -> Self {
        Self {
            code: code.into(),
            msg: msg.to_string(),
            data: None,
        }
    }
}

#[cfg(test)]
pub const CALCULATING_HEADER: &str = "X-Calculating";

#[derive(ApiResponse)]
pub enum GenericResponse<T: ParseFromJSON + ToJSON + Send + Sync> {
    #[oai(status = 200)]
    Ok(
        Json<ResponseObject<T>>,
        #[oai(header = "X-Calculating")] Option<String>,
    ),
}


#[macro_export]
macro_rules! response {
    (ok $data: expr) => {
        Ok(GenericResponse::Ok(poem_openapi::payload::Json(
            ResponseObject::ok($data)
        ), None))
    };
    (err $msg: expr, $code: expr) => {
        Ok(GenericResponse::Ok(poem_openapi::payload::Json(
            ResponseObject::err($msg, $code)), None)
        )
    };
    (calculating) => {
        Ok(GenericResponse::Ok(poem_openapi::payload::Json(
            ResponseObject::err(
                "Still calculating", ErrorCode::Calculating
            )
        ), Some("1".to_string())))
    };
    (internal_server_error) => {
        Ok(GenericResponse::Ok(poem_openapi::payload::Json(
            ResponseObject::err(
                "Something went wrong", ErrorCode::InternalServerError
            )
        ), None))
    };
    (todo) => {
        Ok(GenericResponse::Ok(
            poem_openapi::payload::Json(
                ResponseObject::err(
            "Haven't done this yet sry.", ErrorCode::NotImplemented
        )), None))
    }
}

pub type Response<T> = poem::Result<GenericResponse<T>>;

pub struct ServerExtractor(pub DbServer);

impl<'a> poem::FromRequest<'a> for ServerExtractor {
    async fn from_request(req: &'a Request, _body: &mut poem::RequestBody) -> poem::Result<Self> {
        let server_id = req.raw_path_param("server_id")
            .ok_or_else(|| poem::Error::from_string("Invalid server_id", StatusCode::BAD_REQUEST))?;

        let data: &AppData = req.data()
            .ok_or_else(|| poem::Error::from_string("Invalid server_id", StatusCode::BAD_REQUEST))?;

        let Some(server) = get_server(&data.pool, &data.cache, &server_id).await else {
            return Err(poem::Error::from_string("Server not found", StatusCode::NOT_FOUND))
        };

        Ok(ServerExtractor(server))
    }
}

type UriExtension = dyn UriPatternExt + Send + Sync;

/// Cumulative per-endpoint request counts, as `"{METHOD} {pattern}"` -> count.
pub const METRICS_COUNT_KEY: &str = "gfl-ze-watcher:metrics:endpoint:count";
/// Cumulative per-endpoint service time in *microseconds*, keyed the same as [`METRICS_COUNT_KEY`].
///
/// Microseconds rather than milliseconds because `HINCRBY` is integer-only and most handlers here
/// are cache hits well under 1ms; accumulating rounded milliseconds would floor a large share of
/// requests to zero and drag every average down with them.
pub const METRICS_DURATION_KEY: &str = "gfl-ze-watcher:metrics:endpoint:duration_us";
/// Unix seconds at which the two hashes above started accumulating, so a cumulative total can be
/// reported with the period it covers rather than as a number with no scale.
///
/// It lives beside the counters rather than in Postgres on purpose. The counters are evictable
/// (`redis.conf`: `maxmemory-policy allkeys-lru`, `appendonly no`), so losing them resets `served`
/// to zero — a durable start date elsewhere would outlive the reset and keep claiming a period the
/// counts no longer cover. Here both vanish together and the pair stays honest.
pub const METRICS_SINCE_KEY: &str = "gfl-ze-watcher:metrics:endpoint:since";
/// Cumulative background jobs the consumers have finished, as `"heavy"|"light"` -> count.
///
/// Counted at completion rather than at enqueue, and incremented for failures too, matching what
/// [`PatternLoggerEndpoint`] does for requests. Queue *depth* answers a different question and is a
/// poor one to display: `BRPOP` hands a job straight to a waiting consumer, so `LLEN` reads zero
/// except under real saturation. This climbs visibly instead.
pub const METRICS_JOBS_KEY: &str = "gfl-ze-watcher:metrics:jobs:completed";

/// Per-minute slices of [`METRICS_COUNT_KEY`] and [`METRICS_DURATION_KEY`], suffixed with the unix
/// minute (`unix_secs / 60`) and expiring on their own.
///
/// They exist because the cumulative hashes above answer "how fast has this API been since the
/// counters were created", which months of history make useless for spotting a slowdown happening
/// now. Summing a handful of these instead gives a rolling average. The cumulative pair is still
/// what `served` and the busiest ranking are built from — only the averages read these.
const METRICS_COUNT_BUCKET_PREFIX: &str = "gfl-ze-watcher:metrics:endpoint:count:";
const METRICS_DURATION_BUCKET_PREFIX: &str = "gfl-ze-watcher:metrics:endpoint:duration_us:";

/// How many minute buckets an average covers. Five buckets span between 4:00 and 5:00 of wall time
/// depending on where in the current minute the read lands; minute granularity is the point.
pub const TRAFFIC_WINDOW_MINUTES: u64 = 5;

/// Comfortably longer than the read window, so a bucket is never expiring while still being summed.
/// redis here is `allkeys-lru` with `appendonly no`, so an early eviction is possible regardless —
/// the read side treats a missing bucket as *no data* and falls back to the lifetime average, never
/// as a zero.
const METRICS_BUCKET_TTL: Duration = Duration::from_secs(8 * 60);

/// The `(count, duration)` hash keys for one unix minute. Both sides of the window — the flusher
/// writing and `/health` reading — go through here so they cannot drift apart.
pub fn metrics_bucket_keys(minute: u64) -> (String, String) {
    (
        format!("{METRICS_COUNT_BUCKET_PREFIX}{minute}"),
        format!("{METRICS_DURATION_BUCKET_PREFIX}{minute}"),
    )
}

const METRICS_FLUSH_INTERVAL: Duration = Duration::from_secs(10);

/// Request counts and service time accumulated by [`PatternLoggerEndpoint`], buffered in process
/// and flushed to redis on an interval.
///
/// The buffer exists so the request path does no I/O: redis traffic stays at one pipelined batch
/// every [`METRICS_FLUSH_INTERVAL`] no matter the request rate. `HINCRBY` merges across processes,
/// so several API replicas can flush into the same two hashes without coordinating.
pub struct EndpointMetrics {
    /// endpoint key -> (requests, total microseconds), drained on each flush.
    pending: Mutex<HashMap<String, (u64, u64)>>,
}

/// One accumulator per process, because there is one [`PatternLogger`] per process. A global
/// avoids threading a handle through `build_app` and its test call sites purely to reach the
/// flusher, which only `run_main` spawns — the tests accumulate into a map nothing ever drains.
static METRICS: LazyLock<Arc<EndpointMetrics>> = LazyLock::new(|| {
    Arc::new(EndpointMetrics::new())
});

pub fn endpoint_metrics() -> Arc<EndpointMetrics> {
    METRICS.clone()
}

impl EndpointMetrics {
    fn new() -> Self {
        Self { pending: Mutex::new(HashMap::new()) }
    }

    /// `key` must be built from a *resolved route pattern*, never a raw request path — the path is
    /// attacker-controlled and would let a scanner grow the redis hash without bound. Unmatched
    /// requests collapse to the literal `unknown_pattern`, which is what bounds the field set.
    pub fn record(&self, key: String, elapsed: Duration) {
        let Ok(mut pending) = self.pending.lock() else {
            // A poisoned lock means some other thread panicked mid-update. Metrics are not worth
            // propagating that panic into the request path.
            return;
        };
        let entry = pending.entry(key).or_insert((0, 0));
        entry.0 += 1;
        entry.1 += elapsed.as_micros() as u64;
    }

    fn drain(&self) -> HashMap<String, (u64, u64)> {
        match self.pending.lock() {
            Ok(mut pending) => std::mem::take(&mut *pending),
            Err(_) => HashMap::new(),
        }
    }

    /// Puts counts that failed to reach redis back into the buffer, so an outage costs a delay
    /// rather than a hole in the totals.
    fn restore(&self, drained: HashMap<String, (u64, u64)>) {
        let Ok(mut pending) = self.pending.lock() else { return };
        for (key, (count, micros)) in drained {
            let entry = pending.entry(key).or_insert((0, 0));
            entry.0 += count;
            entry.1 += micros;
        }
    }

    async fn flush(&self, cache: &FastCache) {
        let drained = self.drain();
        if drained.is_empty() {
            return;
        }

        let mut conn = match cache.redis_pool.get().await {
            Ok(conn) => conn,
            Err(e) => {
                tracing::warn!("Endpoint metrics flush could not reach redis: {e}");
                return self.restore(drained);
            }
        };

        let mut pipe = redis::pipe();
        // `NX` makes this write-once, and the empty-buffer return above means it lands on the first
        // flush that carries real counts — never on a process that started and served nothing.
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        pipe.cmd("SET").arg(METRICS_SINCE_KEY).arg(now).arg("NX").ignore();
        // Buffered counts are attributed to the minute they are *flushed* in, so a request served
        // just before a minute boundary can land in the following bucket. That smear is bounded by
        // METRICS_FLUSH_INTERVAL (10s) and is not worth a timestamp on every recorded request.
        let (bucket_count_key, bucket_duration_key) = metrics_bucket_keys(now / 60);
        for (key, (count, micros)) in &drained {
            pipe.hincr(METRICS_COUNT_KEY, key, *count)
                .hincr(METRICS_DURATION_KEY, key, *micros)
                .hincr(&bucket_count_key, key, *count)
                .hincr(&bucket_duration_key, key, *micros);
        }
        // Re-set on every flush rather than only at bucket creation: EXPIRE is idempotent, and a
        // bucket only receives writes while it is the current minute, so the TTL never gets pushed
        // out from under a bucket that has stopped accumulating.
        let ttl = METRICS_BUCKET_TTL.as_secs();
        pipe.expire(&bucket_count_key, ttl as i64).ignore()
            .expire(&bucket_duration_key, ttl as i64).ignore();

        if let Err(e) = pipe.query_async::<()>(&mut *conn).await {
            tracing::warn!("Endpoint metrics flush failed: {e}");
            self.restore(drained);
        }
    }

    /// Only a process that serves HTTP has anything to flush; `run_main` spawns this there.
    pub fn spawn_flusher(metrics: Arc<EndpointMetrics>, cache: Arc<FastCache>) {
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(METRICS_FLUSH_INTERVAL);
            loop {
                ticker.tick().await;
                metrics.flush(&cache).await;
            }
        });
    }
}

pub struct PatternLogger {
    patterns: Arc<PatternTable>,
}

impl PatternLogger{
    /// Flattens every router's patterns into one sorted table here, so the per-request path is a
    /// lookup rather than a rebuild of all ~150 patterns.
    pub fn new(apis: Vec<Arc<UriExtension>>) -> PatternLogger {
        PatternLogger{
            patterns: Arc::new(PatternTable::new(&apis))
        }
    }
}

impl<E: Endpoint<Output = poem::Response>> Middleware<E> for PatternLogger {
    type Output = PatternLoggerEndpoint<E>;

    fn transform(&self, ep: E) -> Self::Output {
        PatternLoggerEndpoint {
            ep,
            patterns: self.patterns.clone(),
            metrics: endpoint_metrics(),
        }
    }
}


pub struct PatternLoggerEndpoint<E> {
    ep: E,
    patterns: Arc<PatternTable>,
    metrics: Arc<EndpointMetrics>,
}

impl<E> Endpoint for PatternLoggerEndpoint<E>
where
    E: Endpoint<Output = poem::Response>,
{
    type Output = poem::Response;
    async fn call(&self, req: Request) -> poem::Result<Self::Output> {
        let uri = req.uri();
        if let Some(user_agent) = req.header("User-Agent") {
            if user_agent.contains("trigger-robot/1.0 (Rust)") {
                tracing::debug!("Ignoring logging trigger robot.");
                return self.ep.call(req).await;
            }
        }
        let uri_path = String::from(uri.path());
        let transaction_name = match self.patterns.find(&uri_path) {
            Some(pattern) => pattern.uri().to_string(),
            None => {
                tracing::warn!("Unregistered pattern: {uri_path}");
                "unknown_pattern".to_string()
            },
        };
        // Built from the resolved pattern rather than `uri_path`, so the redis hash cannot be grown
        // by requesting arbitrary paths; see [`EndpointMetrics::record`].
        let metric_key = format!("{} {transaction_name}", req.method().as_str());

        let span = tracing::info_span!(
            "http_request",
            transaction_name = %transaction_name,
            http.request.method = %req.method().as_str(),
            http.uri = %uri_path,
            otel.kind = "server"
        );

        let result = span.in_scope(|| async {
            let now = Instant::now();
            let res = self.ep.call(req).await;
            let duration = now.elapsed();
            // Recorded before the branch: a request that failed is still one served, and its
            // latency is the one most worth knowing about.
            self.metrics.record(metric_key, duration);

            match &res {
                Ok(resp) => {
                    let status = resp.status();

                    span.record("http.status_code", &status.as_u16());
                    span.record("duration_ms", &duration.as_millis());

                    tracing::info!(
                        status = %status,
                        duration = ?duration,
                        "{uri_path} completed successfully"
                    );
                }
                Err(err) => {
                    let status = err.status();

                    span.record("http.status_code", &status.as_u16());
                    span.record("error", &format!("{}", err));
                    span.record("duration_ms", &duration.as_millis());

                    tracing::error!(
                        status = %status,
                        error = %err,
                        duration = ?duration,
                        "{uri_path} failed"
                    );
                }
            };

            res
        }).await;

        result
    }
}

pub trait UriPatternExt {
    fn get_all_patterns(&self) -> Vec<RoutePattern>;
}

#[derive(Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub name: String,
    pub exp: usize,
    pub iss: String,
}

/// The buffering half of [`EndpointMetrics`], which is the part with no I/O in it. The redis half
/// is covered by the live checks in the `/health` verification steps.
#[cfg(test)]
mod metrics_tests {
    use super::*;

    #[test]
    fn repeated_requests_accumulate_into_one_entry() {
        let metrics = EndpointMetrics::new();
        metrics.record("GET /health".to_string(), Duration::from_micros(400));
        metrics.record("GET /health".to_string(), Duration::from_micros(600));
        metrics.record("GET /servers".to_string(), Duration::from_millis(3));

        let drained = metrics.drain();
        assert_eq!(drained.get("GET /health"), Some(&(2, 1000)));
        assert_eq!(drained.get("GET /servers"), Some(&(1, 3000)));
    }

    /// Sub-millisecond requests are the common case here, so they must survive the buffer rather
    /// than rounding to zero on the way in — the whole reason the totals are microseconds.
    #[test]
    fn sub_millisecond_requests_are_not_rounded_away() {
        let metrics = EndpointMetrics::new();
        for _ in 0..10 {
            metrics.record("GET /health".to_string(), Duration::from_micros(120));
        }
        assert_eq!(metrics.drain().get("GET /health"), Some(&(10, 1200)));
    }

    #[test]
    fn draining_empties_the_buffer_and_restoring_puts_it_back() {
        let metrics = EndpointMetrics::new();
        metrics.record("GET /health".to_string(), Duration::from_micros(500));

        let drained = metrics.drain();
        assert!(metrics.drain().is_empty(), "a drain must not hand the same counts out twice");

        // What a failed flush does, so a redis outage costs a delay rather than lost counts.
        metrics.restore(drained);
        metrics.record("GET /health".to_string(), Duration::from_micros(500));
        assert_eq!(metrics.drain().get("GET /health"), Some(&(2, 1000)));
    }
}

#[cfg(test)]
mod calculating_header_tests {
    use poem::IntoResponse;
    use super::*;

    fn header_of<T>(response: Response<T>) -> Option<String>
    where
        T: ParseFromJSON + ToJSON + Send + Sync,
    {
        response
            .expect("the response macro never produces an Err")
            .into_response()
            .headers()
            .get(CALCULATING_HEADER)
            .map(|value| value.to_str().expect("ascii").to_string())
    }

    #[test]
    fn only_the_calculating_response_carries_the_marker() {
        assert_eq!(header_of(response!(calculating) as Response<String>).as_deref(), Some("1"));

        assert_eq!(header_of(response!(ok "data".to_string())), None);
        assert_eq!(
            header_of(response!(err "nope", ErrorCode::NotFound) as Response<String>),
            None,
        );
        assert_eq!(header_of(response!(internal_server_error) as Response<String>), None);
    }

    /// Every endpoint returns HTTP 200, this header has to exist.
    #[test]
    fn the_marker_does_not_change_the_status_code() {
        let calculating = (response!(calculating) as Response<String>)
            .expect("infallible")
            .into_response();

        assert_eq!(calculating.status(), StatusCode::OK);
    }
}
