use std::cmp::Ordering;
use std::fmt::Display;
use std::panic;
use std::sync::Arc;
use std::time::Instant;
use poem::http::StatusCode;
use poem::{Endpoint, Middleware, Request};
use uri_pattern_matcher::UriPattern;
use poem_openapi::{ApiResponse, Object};
use poem_openapi::payload::Json;
use poem_openapi::types::{ParseFromJSON, ToJSON};
use serde::{Deserialize, Serialize};
use crate::AppData;
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

#[derive(ApiResponse)]
pub enum GenericResponse<T: ParseFromJSON + ToJSON + Send + Sync> {
    #[oai(status = 200)]
    Ok(Json<ResponseObject<T>>),
}


#[macro_export]
macro_rules! response {
    (ok $data: expr) => {
        Ok(GenericResponse::Ok(poem_openapi::payload::Json(
            ResponseObject::ok($data)
        )))
    };
    (err $msg: expr, $code: expr) => {
        Ok(GenericResponse::Ok(poem_openapi::payload::Json(
            ResponseObject::err($msg, $code)))
        )
    };
    (calculating) => {
        Ok(GenericResponse::Ok(poem_openapi::payload::Json(
            ResponseObject::err(
                "Still calculating", ErrorCode::Calculating
            ))
        ))
    };
    (internal_server_error) => {
        Ok(GenericResponse::Ok(poem_openapi::payload::Json(
            ResponseObject::err(
                "Something went wrong", ErrorCode::InternalServerError
            ))
        ))
    };
    (todo) => {
        Ok(GenericResponse::Ok(
            poem_openapi::payload::Json(
                ResponseObject::err(
            "Haven't done this yet sry.", ErrorCode::NotImplemented
        ))))
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

pub struct PatternLogger {
    pub routers: Vec<Arc<UriExtension>>
}

impl PatternLogger{
    pub fn new(apis: Vec<Arc<UriExtension>>) -> PatternLogger {
        PatternLogger{
            routers: apis
        }
    }
}

impl<E: Endpoint<Output = poem::Response>> Middleware<E> for PatternLogger {
    type Output = PatternLoggerEndpoint<E>;

    fn transform(&self, ep: E) -> Self::Output {
        PatternLoggerEndpoint { ep, apis: self.routers.clone() }
    }
}


pub struct PatternLoggerEndpoint<E> {
    ep: E,
    apis: Vec<Arc<UriExtension>>,
}

impl<E> PatternLoggerEndpoint<E>
where
    E: Endpoint<Output = poem::Response>,
{
    fn find_pattern(&self, uri_path: &str) -> Option<RoutePattern<'_>> {
        let mut a = vec![];
        for api in &self.apis {
            for pattern in api.get_all_patterns() {
                a.push(pattern);
            }
        }
        a.iter()
            .filter(|pat| pat.is_match(uri_path))
            .max()
            .map(|e| e.clone())
    }
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
        let transaction_name = match self.find_pattern(&uri_path) {
            Some(pattern) => pattern.uri.to_string(),
            None => {
                tracing::warn!("Unregistered pattern: {uri_path}");
                "unknown_pattern".to_string()
            },
        };

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

#[derive(Clone)]
pub struct RoutePattern<'a> {
    pattern: UriPattern<'a>,
    uri: &'a str,
}

impl<'a> From<&'a str> for RoutePattern<'a> {
    fn from(uri: &'a str) -> Self {
        Self::new(uri)
    }
}

pub fn suppress_panic_logs<F, T>(f: F) -> Option<T>
where
    F: FnOnce() -> T + panic::UnwindSafe,
{
    let original_hook = panic::take_hook();
    panic::set_hook(Box::new(|_| {}));
    let result = panic::catch_unwind(f).ok();
    panic::set_hook(original_hook);
    result
}

impl<'a> RoutePattern<'a> {
    pub fn new(pattern: &'a str) -> Self {
        RoutePattern {
            pattern: UriPattern::from(pattern),
            uri: pattern,
        }
    }

    pub fn is_match(&self, path: &str) -> bool {
        suppress_panic_logs(|| self.pattern.is_match(path)).unwrap_or(false)
    }

    /// The pattern as written, e.g. `/communities/{community_id}/unique_players`. Same syntax the
    /// OpenAPI spec uses for path keys, which is what lets `route_tests` compare the two directly.
    pub fn uri(&self) -> &'a str {
        self.uri
    }
}

impl Eq for RoutePattern<'_> {}

impl PartialEq<Self> for RoutePattern<'_> {
    fn eq(&self, other: &Self) -> bool {
        suppress_panic_logs(||
            other.pattern.eq(&self.pattern)
        ).unwrap_or(false)
    }
}

impl PartialOrd<Self> for RoutePattern<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        suppress_panic_logs(|| {
            other.pattern.partial_cmp(&self.pattern)
        }).unwrap_or(None)
    }
}

impl Ord for RoutePattern<'_> {
    fn cmp(&self, other: &Self) -> Ordering {
        suppress_panic_logs(|| {
            other.pattern.cmp(&self.pattern)
        }).unwrap_or(Ordering::Equal)
    }
}

pub trait UriPatternExt {
    fn get_all_patterns(&self) -> Vec<RoutePattern<'_>>;
}

#[derive(Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub name: String,
    pub exp: usize,
    pub iss: String,
}
