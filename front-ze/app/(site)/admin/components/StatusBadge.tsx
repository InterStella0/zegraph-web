import { Badge } from 'components/ui/badge';
import type { ReportStatus } from 'types/admin';

type Status = ReportStatus | 'approved' | 'rejected';

const STATUS_VARIANTS: Record<Status, "default" | "secondary" | "outline"> = {
  pending: "default",
  resolved: "secondary",
  dismissed: "outline",
  approved: "secondary",
  rejected: "outline",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant={STATUS_VARIANTS[status]} className="capitalize">
      {status}
    </Badge>
  );
}
