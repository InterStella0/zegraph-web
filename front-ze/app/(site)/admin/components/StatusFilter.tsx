'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/ui/select';

const REPORT_STATUSES: [string, string][] = [['pending', 'Pending'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed']];

export function StatusFilter({
  value,
  onChange,
  options = REPORT_STATUSES,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Filter by status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Status</SelectItem>
        {options.map(([status, label]) => (
          <SelectItem key={status} value={status}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
