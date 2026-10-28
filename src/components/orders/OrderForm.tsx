import { useEffect, useRef, useState } from "react";
import { actions } from "astro:actions";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import type {
  OrderFulfillmentMethod,
  OrderStatus,
} from "@/db/schema/enums";
import {
  OrderDetailsFields,
  type OrderDetailsFormValues,
} from "./OrderDetailsFields";
import {
  OrderItemsEditor,
  type RecipeOption,
  type OrderItemRow,
} from "./OrderItemsEditor";

interface CreateProps {
  mode: "create";
  recipeOptions: RecipeOption[];
}

interface EditProps {
  mode: "edit";
  orderId: string;
  recipeOptions: RecipeOption[];
  initialName: string;
  initialNotes: string;
  initialCustomerName: string;
  initialCustomerContact: string;
  initialDueDate: string;
  initialDueTime: string;
  initialFulfillmentMethod: OrderFulfillmentMethod;
  initialDeliveryAddress: string;
  initialStatus: OrderStatus;
  initialItems: OrderItemRow[];
}

type OrderFormProps = CreateProps | EditProps;

function defaultOrderName(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function OrderForm(props: OrderFormProps) {
  const isEdit = props.mode === "edit";
  const [name, setName] = useState(isEdit ? props.initialName : defaultOrderName());
  const [notes, setNotes] = useState(isEdit ? props.initialNotes : "");
  const [details, setDetails] = useState<OrderDetailsFormValues>({
    customerName: isEdit ? props.initialCustomerName : "",
    customerContact: isEdit ? props.initialCustomerContact : "",
    dueDate: isEdit ? props.initialDueDate : defaultDueDate(),
    dueTime: isEdit ? props.initialDueTime : "09:00",
    fulfillmentMethod: isEdit ? props.initialFulfillmentMethod : "PICKUP",
    deliveryAddress: isEdit ? props.initialDeliveryAddress : "",
    status: isEdit ? props.initialStatus : "DRAFT",
  });
  const [items, setItems] = useState<OrderItemRow[]>(
    isEdit ? props.initialItems : [{ recipeId: "", batches: 1 }],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const validItems = items.filter((i) => i.recipeId);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (validItems.length === 0) {
      setError("Add at least one recipe.");
      return;
    }
    if (validItems.length !== items.length) {
      setError("Select a recipe in each row, or remove the empty row.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const payload = {
      name,
      notes: notes || undefined,
      customerName: details.customerName,
      customerContact: details.customerContact,
      dueDate: details.dueDate,
      dueTime: details.dueTime,
      fulfillmentMethod: details.fulfillmentMethod,
      deliveryAddress:
        details.fulfillmentMethod === "DELIVERY" ? details.deliveryAddress : "",
      status: details.status,
      items: validItems.map((i) => ({ recipeId: i.recipeId, batches: i.batches })),
    };

    try {
      if (isEdit) {
        const { error: err } = await actions.orders.update({
          id: props.orderId,
          ...payload,
        });
        if (err) {
          setError(err.message);
          setSubmitting(false);
          return;
        }
        window.location.href = `/orders/${props.orderId}`;
      } else {
        const { data, error: err } = await actions.orders.create(payload);
        if (err) {
          setError(err.message);
          setSubmitting(false);
          return;
        }
        window.location.href = `/orders/${data!.id}`;
      }
    } catch {
      setError("Couldn't save the order. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full min-w-0 space-y-6">
      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-body text-destructive">
          {error}
        </div>
      )}

      <OrderDetailsFields
        name={name}
        onNameChange={setName}
        details={details}
        onDetailsChange={(patch) => setDetails((previous) => ({ ...previous, ...patch }))}
      />

      {/* Recipe items */}
      <OrderItemsEditor
        recipeOptions={props.recipeOptions}
        items={items}
        onChange={(nextItems) => {
          setItems(nextItems);
          setError(null);
        }}
      />

      {/* Notes */}
      <div className="border-t border-border pt-6">
        <label htmlFor="order-notes" className="mb-1 block text-sm font-medium text-foreground">
          Notes <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id="order-notes"
          autoComplete="off"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Special requests, packaging, or pickup and delivery instructions."
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={submitting}>
          {submitting
            ? isEdit
              ? "Saving…"
              : "Creating…"
            : isEdit
              ? "Save order"
              : "Create order"}
        </Button>
        <Button
          variant="secondary"
          href={isEdit ? `/orders/${(props as EditProps).orderId}` : "/orders"}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
