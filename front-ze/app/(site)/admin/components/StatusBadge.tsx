import { Badge } from 'components/ui/badge';
import type { ReportStatus } from 'types/admin';

const STATUS_VARIANTS: Record<ReportStatus, "default" | "secondary" | "outline"> = {
  pending: "default",
  resolved: "secondary",
  dismissed: "outline",
};

export function StatusBadge({ status }: { status: ReportStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]} className="capitalize">
      {status}
    </Badge>
  );
}
