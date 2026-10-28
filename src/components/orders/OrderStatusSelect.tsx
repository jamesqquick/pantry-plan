import { useState } from "react";
import { actions } from "astro:actions";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@/db/schema/enums";

export function OrderStatusSelect({
  orderId,
  initialStatus,
}: {
  orderId: string;
  initialStatus: OrderStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const statusId = `order-status-${orderId}`;

  async function updateStatus(value: string) {
    const nextStatus = value as OrderStatus;
    const previousStatus = status;
    setStatus(nextStatus);
    setSaving(true);

    try {
      const { error: actionError } = await actions.orders.updateStatus({
        id: orderId,
        status: nextStatus,
      });
      if (actionError) {
        setStatus(previousStatus);
      }
    } catch {
      setStatus(previousStatus);
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      id={statusId}
      aria-label="Order status"
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
  );
}
