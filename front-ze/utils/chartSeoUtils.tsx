import {formatHours, formatNumber} from "utils/generalUtils.ts";

// Plain-text and table summaries of charts, for screen readers and crawlers.

const plural = (count: number, noun: string) => `${noun}${count !== 1 ? 's' : ''}`;
const sum = <T,>(items: T[], value: (item: T) => number) => items.reduce((total, item) => total + value(item), 0);
const largest = <T,>(items: T[], value: (item: T) => number) => [...items].sort((a, b) => value(b) - value(a))[0];

export function calculateTimeSeriesStats(data: { label: string; value: number }[]) {
  if (!data?.length) return { max: 0, min: 0, avg: 0, total: 0, count: 0 };
  const values = data.map(d => d.value);
  const total = sum(values, v => v);
  return { max: Math.max(...values), min: Math.min(...values), avg: total / values.length, total, count: values.length };
}

export function generateSeoTable(
  headers: string[],
  rows: Record<string, string | number>[],
  caption: string,
  limit = 20
): React.ReactElement {
  return (
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>{headers.map((header, i) => <th key={i}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.slice(0, limit).map((row, i) => (
          <tr key={i}>{headers.map((header, j) => <td key={j}>{row[header]}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

export function summarizeRegionData(regions: { region: string; hours: number; percentage: number }[]): string {
  if (!regions?.length) return 'No regional data available.';
  const top = largest(regions, r => r.hours);
  return `Regional distribution across ${regions.length} ${plural(regions.length, 'region')}. ` +
    `Top region: ${top.region} with ${formatHours(top.hours)} (${top.percentage.toFixed(1)}% of total playtime).`;
}

export function summarizePlayerTypes(types: { type: string; hours: number; percentage: number }[]): string {
  if (!types?.length) return 'No player type data available.';
  const dominant = largest(types, t => t.hours);
  return `Player type distribution shows ${formatHours(sum(types, t => t.hours))} total. ` +
    `Dominant type: ${dominant.type} with ${formatHours(dominant.hours)} (${dominant.percentage.toFixed(1)}%).`;
}

export function summarizeSessionDistribution(sessions: { range: string; count: number; percentage: number }[]): string {
  if (!sessions?.length) return 'No session data available.';
  const total = sum(sessions, s => s.count);
  const mostCommon = largest(sessions, s => s.count);
  return `Total of ${formatNumber(total)} ${plural(total, 'session')} recorded. ` +
    `Most common duration: ${mostCommon.range} with ${formatNumber(mostCommon.count)} sessions (${mostCommon.percentage.toFixed(1)}%).`;
}

export function formatDateRange(startDate: Date | string, endDate: Date | string): string {
  const format = (date: Date | string) =>
    new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return `${format(startDate)} to ${format(endDate)}`;
}
