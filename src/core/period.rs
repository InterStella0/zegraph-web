use std::borrow::Cow;

use chrono::{DateTime, TimeZone, Utc};
use poem_openapi::registry::{MetaSchema, MetaSchemaRef};
use poem_openapi::types::{ParseError, ParseFromParameter, ParseResult, Type};
use serde::{Deserialize, Serialize};

/// The first year the data covers; collection started in February 2024.
pub const FIRST_YEAR: i32 = 2024;
pub const PERIOD_PATTERN: &str = r"^(all|\d{4}(-\d{2})?)$";

/// A calendar year or month in UTC, covering `[start, end)`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TimePeriod {
    Year(i32),
    Month(i32, u32),
}

impl TimePeriod {
    /// Parses `YYYY` or `YYYY-MM`; `all` (or an empty value) means no period.
    pub fn parse(value: &str, now: DateTime<Utc>) -> Result<Option<Self>, String> {
        let value = value.trim();
        if value.is_empty() || value.eq_ignore_ascii_case("all") {
            return Ok(None);
        }
        let digits = |s: &str, len: usize| s.len() == len && s.bytes().all(|b| b.is_ascii_digit());
        let invalid = || format!("`{value}` is not a period; expected `all`, `YYYY` or `YYYY-MM`");

        let period = match value.split_once('-') {
            None if digits(value, 4) => TimePeriod::Year(value.parse().map_err(|_| invalid())?),
            Some((year, month)) if digits(year, 4) && digits(month, 2) => {
                let month: u32 = month.parse().map_err(|_| invalid())?;
                if !(1..=12).contains(&month) {
                    return Err(format!("`{value}` has no month {month}"));
                }
                TimePeriod::Month(year.parse().map_err(|_| invalid())?, month)
            }
            _ => return Err(invalid()),
        };

        if period.year() < FIRST_YEAR {
            return Err(format!("no data exists before {FIRST_YEAR}"));
        }
        if period.start() > now {
            return Err(format!("`{value}` has not started yet"));
        }
        Ok(Some(period))
    }

    fn year(&self) -> i32 {
        match *self {
            TimePeriod::Year(year) | TimePeriod::Month(year, _) => year,
        }
    }

    pub fn start(&self) -> DateTime<Utc> {
        match *self {
            TimePeriod::Year(year) => month_start(year, 1),
            TimePeriod::Month(year, month) => month_start(year, month),
        }
    }

    pub fn end(&self) -> DateTime<Utc> {
        match *self {
            TimePeriod::Year(year) => month_start(year + 1, 1),
            TimePeriod::Month(year, 12) => month_start(year + 1, 1),
            TimePeriod::Month(year, month) => month_start(year, month + 1),
        }
    }

    pub fn label(&self) -> String {
        match *self {
            TimePeriod::Year(year) => format!("{year:04}"),
            TimePeriod::Month(year, month) => format!("{year:04}-{month:02}"),
        }
    }

    /// Whether the period is entirely in the past, so its numbers can no longer change.
    pub fn is_closed(&self, now: DateTime<Utc>) -> bool {
        self.end() <= now
    }
}

fn month_start(year: i32, month: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(year, month, 1, 0, 0, 0)
        .single()
        .expect("the first of a month at midnight UTC always exists")
}

/// The `period` query parameter: `all`, `YYYY` or `YYYY-MM`, in UTC.
pub struct PeriodParam(pub Option<TimePeriod>);

impl Type for PeriodParam {
    const IS_REQUIRED: bool = true;
    type RawValueType = Self;
    type RawElementValueType = Self;

    fn name() -> Cow<'static, str> {
        "TimePeriod".into()
    }

    fn schema_ref() -> MetaSchemaRef {
        MetaSchemaRef::Inline(Box::new(MetaSchema {
            pattern: Some(PERIOD_PATTERN.to_string()),
            ..MetaSchema::new("string")
        }))
    }

    fn as_raw_value(&self) -> Option<&Self::RawValueType> {
        Some(self)
    }

    fn raw_element_iter<'a>(
        &'a self,
    ) -> Box<dyn Iterator<Item = &'a Self::RawElementValueType> + 'a> {
        Box::new(self.as_raw_value().into_iter())
    }
}

impl ParseFromParameter for PeriodParam {
    fn parse_from_parameter(value: &str) -> ParseResult<Self> {
        TimePeriod::parse(value, Utc::now())
            .map(PeriodParam)
            .map_err(ParseError::custom)
    }
}

pub fn flatten_period(param: Option<PeriodParam>) -> Option<TimePeriod> {
    param.and_then(|p| p.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(year: i32, month: u32, day: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(year, month, day, 0, 0, 0).unwrap()
    }

    fn now() -> DateTime<Utc> {
        at(2026, 10, 6)
    }

    #[test]
    fn parses_years_months_and_all() {
        assert_eq!(TimePeriod::parse("2025", now()), Ok(Some(TimePeriod::Year(2025))));
        assert_eq!(TimePeriod::parse("2025-06", now()), Ok(Some(TimePeriod::Month(2025, 6))));
        assert_eq!(TimePeriod::parse("all", now()), Ok(None));
        assert_eq!(TimePeriod::parse("", now()), Ok(None));
    }

    #[test]
    fn rejects_malformed_and_out_of_range_values() {
        for value in ["2025-13", "2025-00", "2025-6x", "2025-6", "abcd", "25", "2025-06-01", "-2025"] {
            assert!(TimePeriod::parse(value, now()).is_err(), "{value} should be rejected");
        }
    }

    #[test]
    fn rejects_periods_before_the_data_or_in_the_future() {
        assert!(TimePeriod::parse("2023", now()).is_err());
        assert!(TimePeriod::parse("2023-12", now()).is_err());
        assert!(TimePeriod::parse("2026-11", now()).is_err());
        assert!(TimePeriod::parse("2027", now()).is_err());
        assert_eq!(TimePeriod::parse("2026-10", now()), Ok(Some(TimePeriod::Month(2026, 10))));
        assert_eq!(TimePeriod::parse("2026", now()), Ok(Some(TimePeriod::Year(2026))));
    }

    #[test]
    fn bounds_are_half_open_utc() {
        let june = TimePeriod::Month(2025, 6);
        assert_eq!(june.start(), at(2025, 6, 1));
        assert_eq!(june.end(), at(2025, 7, 1));

        let december = TimePeriod::Month(2025, 12);
        assert_eq!(december.end(), at(2026, 1, 1));

        let year = TimePeriod::Year(2025);
        assert_eq!(year.start(), at(2025, 1, 1));
        assert_eq!(year.end(), at(2026, 1, 1));
    }

    #[test]
    fn labels_are_zero_padded() {
        assert_eq!(TimePeriod::Year(2025).label(), "2025");
        assert_eq!(TimePeriod::Month(2025, 6).label(), "2025-06");
    }

    #[test]
    fn a_period_closes_exactly_at_its_end() {
        let june = TimePeriod::Month(2025, 6);
        assert!(!june.is_closed(at(2025, 6, 30)));
        assert!(!june.is_closed(at(2025, 7, 1) - chrono::TimeDelta::seconds(1)));
        assert!(june.is_closed(at(2025, 7, 1)));
    }
}
