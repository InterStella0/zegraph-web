'use client';

import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from 'components/ui/avatar';
import { Badge } from 'components/ui/badge';
import { Skeleton } from 'components/ui/skeleton';
import { fetchApiUrl } from 'utils/generalUtils';
import { formatDate } from './utils';
import type { AuditFieldChange, AuditLogEntry, AuditLogsResponse } from 'types/admin';

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  update_global: 'Global',
  update_server: 'Per-Server',
  delete_map: 'Deleted',
};

export function auditActionBadgeVariant(action: string): 'default' | 'secondary' | 'destructive' {
  if (action === 'delete_map') return 'destructive';
  if (action === 'update_server') return 'secondary';
  return 'default';
}

export function AuditChangesList({ changes }: { changes: AuditFieldChange[] }) {
  if (changes.length === 0) return null;
  return (
    <div className="space-y-0.5">
      {changes.map((change) => (
        <div key={change.field} className="text-xs font-mono text-muted-foreground break-all">
          <span className="text-foreground">{change.field}</span>
          {': '}
          <span>{change.old_value ?? '—'}</span>
          {' → '}
          <span>{change.new_value ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}

export function MapAuditHistory({ mapName, refreshKey }: { mapName: string; refreshKey?: number }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchApiUrl('/admin/audit-logs', { params: { map_name: mapName, page: '1', limit: '20' } })
      .then((data) => {
        if (!cancelled) setLogs((data as AuditLogsResponse).logs ?? []);
      })
      .catch((e) => {
        console.error('Failed to fetch map audit history:', e);
        if (!cancelled) setLogs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [mapName, refreshKey]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">No edits recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div key={log.id} className="rounded-md border p-2.5 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Avatar className="h-5 w-5">
              <AvatarImage src={log.user_avatar || undefined} />
              <AvatarFallback className="text-[10px]">
                {log.user_name?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-medium truncate max-w-[10rem]">
              {log.user_name || log.user_id}
            </span>
            <Badge variant={auditActionBadgeVariant(log.action)} className="text-[10px] px-1.5 py-0">
              {AUDIT_ACTION_LABELS[log.action] ?? log.action}
            </Badge>
          </div>
          {log.server_name && (
            <div className="text-xs text-muted-foreground">{log.server_name}</div>
          )}
          <AuditChangesList changes={log.changes} />
          <div className="text-[11px] text-muted-foreground">{formatDate(log.created_at)}</div>
        </div>
      ))}
    </div>
  );
}
