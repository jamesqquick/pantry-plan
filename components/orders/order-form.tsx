"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createOrderAction,
  updateOrderAction,
  deleteOrderAction,
} from "@/app/actions/orders.actions";
import type { RecipeOption } from "@/components/orders/order-items-editor";
import { OrderItemsEditor, type OrderItemRow } from "@/components/orders/order-items-editor";
import { Button } from "@/components/ui/button";
import { AppIcon, ICON_LABEL_GAP_CLASS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CreateProps = {
  mode: "create";
  recipeOptions: RecipeOption[];
};

type EditProps = {
  mode: "edit";
  orderId: string;
  recipeOptions: RecipeOption[];
  initialName: string;
  initialNotes: string;
  initialItems: OrderItemRow[];
};

type Props = CreateProps | EditProps;

export function OrderForm(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const [name, setName] = useState(isEdit ? props.initialName : "");
  const [notes, setNotes] = useState(isEdit ? props.initialNotes : "");
  const [items, setItems] = useState<OrderItemRow[]>(
    isEdit ? props.initialItems : [{ recipeId: props.recipeOptions[0]?.id ?? "", batches: 1 }]
  );

  const [createState, createFormAction] = useActionState(createOrderAction, null);
  const [updateState, updateFormAction] = useActionState(updateOrderAction, null);
  const [deleteState, deleteFormAction] = useActionState(deleteOrderAction, null);
  const state = isEdit ? updateState : createState;

  useEffect(() => {
    if (state && state.ok && state.data?.id) {
      if (!isEdit) {
        setName("");
        setNotes("");
        setItems([{ recipeId: props.recipeOptions[0]?.id ?? "", batches: 1 }]);
      }
      router.push(`/orders/${state.data.id}`);
      router.refresh();
    }
  }, [state, router, isEdit, props.recipeOptions]);

  useEffect(() => {
    if (deleteState?.ok) {
      router.push("/orders");
      router.refresh();
    }
  }, [deleteState, router]);

  const formAction = isEdit ? updateFormAction : createFormAction;
  const fieldErrors = state && !state.ok ? state.error?.fieldErrors ?? {} : {};

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEdit ? "Edit order" : "Order details"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={props.orderId} />}
          <input type="hidden" name="items" value={JSON.stringify(items)} />
          <div>
            <label htmlFor="order-name" className="mb-1 block text-sm font-medium text-foreground">
              Name (optional)
            </label>
            <Input
              id="order-name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Thanksgiving 2025"
            />
          </div>
          <div>
            <label htmlFor="order-notes" className="mb-1 block text-sm font-medium text-foreground">
              Notes (optional)
            </label>
            <Textarea
              id="order-notes"
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes"
            />
          </div>
          <OrderItemsEditor
            recipeOptions={props.recipeOptions}
            items={items}
            onChange={setItems}
            fieldErrors={fieldErrors}
          />
          {state && !state.ok && state.error?.message && !state.error?.fieldErrors && (
            <p className="text-sm text-destructive" role="alert">
              {state.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit">{isEdit ? "Save order" : "Create order"}</Button>
            {isEdit && (
              <Button type="button" variant="secondary" onClick={() => router.push(`/orders/${props.orderId}`)}>
                Cancel
              </Button>
            )}
          </div>
        </form>
        {isEdit && (
          <div className="border-t border-border pt-4">
            <form action={deleteFormAction} onSubmit={(e) => !confirm("Delete this order?") && e.preventDefault()}>
              <input type="hidden" name="id" value={props.orderId} />
              <Button type="submit" variant="danger" className={ICON_LABEL_GAP_CLASS}>
                <AppIcon name="delete" size={18} aria-hidden />
                Delete order
              </Button>
            </form>
            {deleteState && !deleteState.ok && (
              <p className="mt-2 text-sm text-destructive">{deleteState.error.message}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
