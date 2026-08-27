import { useState } from "react";
import { actions } from "astro:actions";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
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

export default function OrderForm(props: OrderFormProps) {
  const isEdit = props.mode === "edit";
  const [name, setName] = useState(isEdit ? props.initialName : defaultOrderName());
  const [notes, setNotes] = useState(isEdit ? props.initialNotes : "");
  const [items, setItems] = useState<OrderItemRow[]>(
    isEdit ? props.initialItems : [{ recipeId: "", batches: 1 }],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validItems = items.filter((i) => i.recipeId);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (validItems.length === 0) {
      setError("Add at least one recipe.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const payload = {
      name,
      notes: notes || undefined,
      items: validItems.map((i) => ({ recipeId: i.recipeId, batches: i.batches })),
    };

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
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Name */}
      <div>
        <label htmlFor="order-name" className="mb-1 block text-sm font-medium text-foreground">
          Name <span className="text-destructive">*</span>
        </label>
        <Input
          id="order-name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Thanksgiving 2025"
          required
        />
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="order-notes" className="mb-1 block text-sm font-medium text-foreground">
          Notes{" "}
          <span className="font-normal text-muted-foreground">(supports Markdown)</span>
        </label>
        <Textarea
          id="order-notes"
          autoComplete="off"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional notes…"
        />
      </div>

      {/* Recipe items */}
      <OrderItemsEditor
        recipeOptions={props.recipeOptions}
        items={items}
        onChange={setItems}
      />

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={submitting || validItems.length === 0}>
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
