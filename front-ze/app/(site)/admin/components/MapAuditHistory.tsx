'use client';

import { Avatar, AvatarFallback, AvatarImage } from 'components/ui/avatar';
import { Badge } from 'components/ui/badge';
import { Skeleton } from 'components/ui/skeleton';
import { fetchApiUrl, range } from 'utils/generalUtils';
import { useResource } from 'lib/hooks/useResource';
import { formatDate } from './utils';
import type { AuditFieldChange, AuditLogEntry, AuditLogsResponse } from 'types/admin';

const AUDIT_ACTIONS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  update_global: { label: 'Global', variant: 'default' },
  update_server: { label: 'Per-Server', variant: 'secondary' },
  delete_map: { label: 'Deleted', variant: 'destructive' },
};

export function AuditActionBadge({ action, className }: { action: string; className?: string }) {
  return (
    <Badge variant={AUDIT_ACTIONS[action]?.variant ?? 'default'} className={className}>
      {AUDIT_ACTIONS[action]?.label ?? action}
    </Badge>
  );
}

export function AuditUserAvatar({ log, className, fallbackClassName }: {
  log: AuditLogEntry;
  className: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={className}>
      <AvatarImage src={log.user_avatar || undefined} />
      <AvatarFallback className={fallbackClassName}>
        {log.user_name?.[0]?.toUpperCase() || 'U'}
      </AvatarFallback>
    </Avatar>
  );
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
  const { data: logs, loading } = useResource(
    () => fetchApiUrl('/admin/audit-logs', { params: { map_name: mapName, page: '1', limit: '20' } })
      .then((data: AuditLogsResponse) => data.logs ?? []),
    [mapName, refreshKey],
    { errorLog: 'Failed to fetch map audit history:' },
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {range(3).map((i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!logs?.length) {
    return <p className="text-sm text-muted-foreground">No edits recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div key={log.id} className="rounded-md border p-2.5 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <AuditUserAvatar log={log} className="h-5 w-5" fallbackClassName="text-[10px]" />
            <span className="text-xs font-medium truncate max-w-[10rem]">
              {log.user_name || log.user_id}
            </span>
            <AuditActionBadge action={log.action} className="text-[10px] px-1.5 py-0" />
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
