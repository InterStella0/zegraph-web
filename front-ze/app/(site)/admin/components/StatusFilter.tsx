'use client';

import { useState } from 'react';
import { sendJson } from 'lib/sendJson';
import { OptionSelect, runAction, useAdminData } from './AdminUI';

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
    <div className="mb-4">
      <OptionSelect
        value={value}
        onChange={onChange}
        options={[['all', 'All Status'], ...options]}
        placeholder="Filter by status"
        className="w-[180px]"
      />
    </div>
  );
}

/** A list filtered by status (pending first), read from `data[key]`, whose items take `PUT {endpoint}/{id}/status`. */
export function useStatusList<T>(endpoint: string, key: string, label: string) {
  const [statusFilter, setStatusFilter] = useState('pending');
  const list = useAdminData<T[]>(
    endpoint,
    (data) => (data as Record<string, T[]>)[key] || [],
    [],
    label,
    statusFilter !== 'all' ? { status: statusFilter } : {},
  );
  const updateStatus = (id: string, status: string, options: Parameters<typeof runAction>[2]) =>
    runAction(() => sendJson(`${endpoint}/${id}/status`, 'PUT', { status }), list.reload, options);
  return { ...list, statusFilter, setStatusFilter, updateStatus };
}
