import {formatHours, formatNumber} from "utils/generalUtils.ts";

interface TimeSeriesData {
  label: string;
  value: number;
}

interface TimeSeriesStats {
  max: number;
  min: number;
  avg: number;
  total: number;
  count: number;
}

export function calculateTimeSeriesStats(data: TimeSeriesData[]): TimeSeriesStats {
  if (!data || data.length === 0) {
    return { max: 0, min: 0, avg: 0, total: 0, count: 0 };
  }

  const values = data.map(d => d.value);
  const total = values.reduce((sum, val) => sum + val, 0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const avg = total / values.length;

  return {
    max,
    min,
    avg,
    total,
    count: values.length
  };
}

interface TableRow {
  [key: string]: string | number;
}

export function generateSeoTable(
  headers: string[],
  rows: TableRow[],
  caption: string,
  limit = 20
): React.ReactElement {
  const limitedRows = rows.slice(0, limit);

  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((header, i) => (
            <th key={i}>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {limitedRows.map((row, i) => (
          <tr key={i}>
            {headers.map((header, j) => (
              <td key={j}>{row[header]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface RegionData {
  region: string;
  hours: number;
  percentage: number;
}

export function summarizeRegionData(regions: RegionData[]): string {
  if (!regions || regions.length === 0) {
    return 'No regional data available.';
  }

  const sortedRegions = [...regions].sort((a, b) => b.hours - a.hours);
  const topRegion = sortedRegions[0];
  const totalRegions = regions.length;

  return `Regional distribution across ${totalRegions} region${totalRegions !== 1 ? 's' : ''}. ` +
    `Top region: ${topRegion.region} with ${formatHours(topRegion.hours)} ` +
    `(${topRegion.percentage.toFixed(1)}% of total playtime).`;
}

interface PlayerTypeData {
  type: string;
  hours: number;
  percentage: number;
}

export function summarizePlayerTypes(types: PlayerTypeData[]): string {
  if (!types || types.length === 0) {
    return 'No player type data available.';
  }

  const sortedTypes = [...types].sort((a, b) => b.hours - a.hours);
  const dominant = sortedTypes[0];
  const total = types.reduce((sum, t) => sum + t.hours, 0);

  return `Player type distribution shows ${formatHours(total)} total. ` +
    `Dominant type: ${dominant.type} with ${formatHours(dominant.hours)} ` +
    `(${dominant.percentage.toFixed(1)}%).`;
}

interface SessionBucket {
  range: string;
  count: number;
  percentage: number;
}

export function summarizeSessionDistribution(sessions: SessionBucket[]): string {
  if (!sessions || sessions.length === 0) {
    return 'No session data available.';
  }

  const totalSessions = sessions.reduce((sum, s) => sum + s.count, 0);
  const mostCommon = [...sessions].sort((a, b) => b.count - a.count)[0];

  return `Total of ${formatNumber(totalSessions)} session${totalSessions !== 1 ? 's' : ''} recorded. ` +
    `Most common duration: ${mostCommon.range} with ${formatNumber(mostCommon.count)} sessions ` +
    `(${mostCommon.percentage.toFixed(1)}%).`;
}

export function formatDateRange(startDate: Date | string, endDate: Date | string): string {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return `${formatDate(start)} to ${formatDate(end)}`;
}
