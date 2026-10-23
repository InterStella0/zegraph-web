'use client';

import { useState } from 'react';
import { TableCell, TableRow } from 'components/ui/table';
import { SearchField } from 'components/ui/SearchField';
import { formatDate } from '../components/utils';
import { AdminHeader, AdminPagination, AdminSpinner, AdminTable, OptionSelect, useAdminData, useSearchPaging } from '../components/AdminUI';
import { AuditActionBadge, AuditChangesList, AuditUserAvatar } from '../components/MapAuditHistory';
import type { AuditLogEntry, AuditLogsResponse } from 'types/admin';

const PAGE_SIZE = 50;

const ACTION_FILTERS: [string, string][] = [
  ['all', 'All actions'],
  ['update_global', 'Global update'],
  ['update_server', 'Per-server update'],
  ['delete_map', 'Map deleted'],
];

export default function AuditLogsPage() {
  const { page, setPage, debouncedSearch, searchProps } = useSearchPaging();
  const [actionFilter, setActionFilter] = useState('all');

  const params: Record<string, string> = {
    page: page.toString(),
    limit: PAGE_SIZE.toString(),
  };
  if (debouncedSearch) params.map_name = debouncedSearch;
  if (actionFilter !== 'all') params.action = actionFilter;
  const { data: { logs, total }, loading } = useAdminData(
    '/admin/audit-logs',
    (data) => ({ logs: (data as AuditLogsResponse).logs ?? [], total: (data as AuditLogsResponse).total ?? 0 }),
    { logs: [] as AuditLogEntry[], total: 0 },
    'audit logs',
    params,
  );

  return (
    <div className="p-6 space-y-4">
      <AdminHeader title="Audit Log" description="History of editing everything in here bubba" />

      <div className="flex flex-wrap items-center gap-3">
        <SearchField className="max-w-sm flex-1 min-w-[12rem]" placeholder="Filter by map name…" {...searchProps} />
        <OptionSelect
          value={actionFilter}
          onChange={(v) => { setActionFilter(v); setPage(1); }}
          options={ACTION_FILTERS}
          placeholder="Action"
          className="w-[180px]"
        />
      </div>

      {loading ? (
        <AdminSpinner />
      ) : (
        <AdminTable headers={['User', 'Action', 'Map', 'Server', 'Changes', 'Date']} rows={logs} empty="No audit entries found">
          {(log) => (
            <TableRow key={log.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <AuditUserAvatar log={log} className="h-8 w-8" />
                  <span>{log.user_name || log.user_id}</span>
                </div>
              </TableCell>
              <TableCell>
                <AuditActionBadge action={log.action} />
              </TableCell>
              <TableCell className="font-mono text-xs">{log.map_name ?? '-'}</TableCell>
              <TableCell>{log.server_name ?? (log.server_id ? log.server_id : '-')}</TableCell>
              <TableCell className="max-w-md">
                <AuditChangesList changes={log.changes} />
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(log.created_at)}</TableCell>
            </TableRow>
          )}
        </AdminTable>
      )}

      <AdminPagination page={page} setPage={setPage} total={total} pageSize={PAGE_SIZE} noun="entries" />
    </div>
  );
}
