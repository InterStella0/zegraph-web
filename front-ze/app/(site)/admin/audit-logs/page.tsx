'use client';

import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/ui/table';
import { Input } from 'components/ui/input';
import { Badge } from 'components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from 'components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from 'components/ui/select';
import { Search } from 'lucide-react';
import { formatDate } from '../components/utils';
import { AdminHeader, AdminPagination, AdminSpinner, EmptyRow, useAdminData, useSearchPaging } from '../components/AdminUI';
import { AUDIT_ACTION_LABELS, AuditChangesList, auditActionBadgeVariant } from '../components/MapAuditHistory';
import type { AuditLogEntry, AuditLogsResponse } from 'types/admin';

const PAGE_SIZE = 50;

export default function AuditLogsPage() {
  const { page, setPage, search, debouncedSearch, handleSearchChange } = useSearchPaging();
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
        <div className="relative max-w-sm flex-1 min-w-[12rem]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Filter by map name…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="update_global">Global update</SelectItem>
            <SelectItem value="update_server">Per-server update</SelectItem>
            <SelectItem value="delete_map">Map deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <AdminSpinner />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Map</TableHead>
              <TableHead>Server</TableHead>
              <TableHead>Changes</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <EmptyRow colSpan={6}>No audit entries found</EmptyRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={log.user_avatar || undefined} />
                        <AvatarFallback>
                          {log.user_name?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span>{log.user_name || log.user_id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={auditActionBadgeVariant(log.action)}>
                      {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.map_name ?? '-'}</TableCell>
                  <TableCell>{log.server_name ?? (log.server_id ? log.server_id : '-')}</TableCell>
                  <TableCell className="max-w-md">
                    <AuditChangesList changes={log.changes} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(log.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}

      <AdminPagination page={page} setPage={setPage} total={total} pageSize={PAGE_SIZE} noun="entries" />
    </div>
  );
}
