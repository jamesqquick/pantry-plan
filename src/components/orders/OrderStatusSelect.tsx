import { useState } from "react";
import { actions } from "astro:actions";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@/db/schema/enums";
import { OrderStatusBadge } from "./OrderStatusBadge";

const STATUS_HELP: Record<OrderStatus, string> = {
  DRAFT: "Still working out the details. Update the status when the customer confirms.",
  CONFIRMED: "The customer has confirmed. Plan your batches and get ready to bake.",
  READY: "Prepared and packed, ready for pickup or delivery.",
  COMPLETED: "Picked up or delivered. This order is finished.",
  CANCELLED: "This order is no longer going ahead.",
};

export function OrderStatusSelect({
  orderId,
  initialStatus,
}: {
  orderId: string;
  initialStatus: OrderStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState(STATUS_HELP[initialStatus]);
  const statusId = `order-status-${orderId}`;

  async function updateStatus(value: string) {
    const nextStatus = value as OrderStatus;
    const previousStatus = status;
    setStatus(nextStatus);
    setSaving(true);
    setError(null);
    setMessage("Saving status…");

    try {
      const { error: actionError } = await actions.orders.updateStatus({
        id: orderId,
        status: nextStatus,
      });
      if (actionError) {
        setStatus(previousStatus);
        setMessage(STATUS_HELP[previousStatus]);
        setError(actionError.message);
        return;
      }
      setStatus(nextStatus);
      setMessage(`Status set to ${ORDER_STATUS_LABELS[nextStatus]}.`);
    } catch {
      setStatus(previousStatus);
      setMessage(STATUS_HELP[previousStatus]);
      setError("Couldn't update the order status. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={statusId} className="text-sm font-medium text-foreground">
          Order status
        </label>
        <OrderStatusBadge status={status} />
      </div>
      <select
        id={statusId}
        aria-describedby={`${statusId}-feedback`}
        value={status}
        onChange={(event) => void updateStatus(event.target.value)}
        disabled={saving}
        className="flex h-10 w-full cursor-pointer rounded-input border border-input bg-card px-3 py-1.5 font-ui text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {ORDER_STATUSES.map((option) => (
          <option key={option} value={option}>
            {ORDER_STATUS_LABELS[option]}
          </option>
        ))}
      </select>
      <p id={`${statusId}-feedback`} role={error ? "alert" : "status"} className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
        {error ?? message}
      </p>
    </div>
  );
}
