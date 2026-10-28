import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@/db/schema/enums";

const STATUS_STYLES: Record<OrderStatus, string> = {
  DRAFT: "border-border bg-panel text-muted-foreground",
  CONFIRMED: "border-border bg-accent text-foreground",
  READY: "border-success/30 bg-success/10 text-success",
  COMPLETED: "border-success/30 bg-success/10 text-success",
  CANCELLED: "border-destructive/30 bg-destructive/5 text-destructive",
};

export function OrderStatusBadge({
  status,
  className = "",
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]} ${className}`}
      data-status={status}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
