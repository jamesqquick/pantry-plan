import { useCallback, useEffect, useRef, useState } from "react";
import { actions } from "astro:actions";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { ErrorToast } from "@/components/ui/ErrorToast";
import { getSafeActionErrorMessage } from "@/lib/safe-action-error";
import {
  MobileFormActions,
  mobileFormActionButtonClass,
} from "@/components/ui/MobileFormActions";
import { centsToDollarsInput, dollarsInputToCents } from "@/lib/money";
import { MaterialForm } from "@/components/materials/MaterialForm";
import { OrderMaterialsEditor, type OrderMaterialRow } from "./OrderMaterialsEditor";
import { OrderCostSummary } from "./OrderCostSummary";
import { materialLineCost, materialToUsage, type MaterialOption, type MaterialUsage } from "@/features/materials/materials";
import { orderMaterialsSchema } from "@/features/materials/materials.schemas";
import { buildGroceryList } from "@/lib/grocery/aggregate";
import type { RecipeForGrocery } from "@/lib/grocery/recipes";
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
  initialTotalCostCents: number | null;
  initialCustomerName: string;
  initialCustomerContact: string;
  initialDueDate: string;
  initialDueTime: string;
  initialFulfillmentMethod: OrderFulfillmentMethod;
  initialDeliveryAddress: string;
  initialStatus: OrderStatus;
  initialItems: OrderItemRow[];
}

type OrderFormProps = (CreateProps | EditProps) & {
  materialOptions?: MaterialOption[];
  initialMaterials?: MaterialUsage[];
  groceryRecipes?: RecipeForGrocery[];
};
const SAVE_ERROR_FALLBACK = "Couldn't save the order. Check your connection and try again.";

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

function isBadRequestActionError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "BAD_REQUEST";
}

export default function OrderForm(props: OrderFormProps) {
  const isEdit = props.mode === "edit";
  const [name, setName] = useState(isEdit ? props.initialName : defaultOrderName());
  const [notes, setNotes] = useState(isEdit ? props.initialNotes : "");
  const [details, setDetails] = useState<OrderDetailsFormValues>({
    totalCost: isEdit && props.initialTotalCostCents != null
      ? centsToDollarsInput(props.initialTotalCostCents)
      : "0",
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
  const [materialOptions, setMaterialOptions] = useState(props.materialOptions ?? []);
  const [materials, setMaterials] = useState<OrderMaterialRow[]>(() => props.initialMaterials?.length
    ? props.initialMaterials.map((item) => ({ materialId: item.materialId, quantity: item.quantity, query: "" }))
    : [{ materialId: "", quantity: "1", query: "" }]);
  const [creatingMaterial, setCreatingMaterial] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const materialsRef = useRef<HTMLDivElement>(null);
  const dismissToast = useCallback(() => setToastMessage(null), []);

  function returnToOrder() {
    setCreatingMaterial(null);
    requestAnimationFrame(() => materialsRef.current?.focus());
  }

  const validItems = items.filter((i) => i.recipeId);
  const materialChoices = materialOptions.map((option) => props.initialMaterials?.find((item) => item.materialId === option.id) ?? materialToUsage(option));
  for (const saved of props.initialMaterials ?? []) {
    if (!materialChoices.some((item) => item.materialId === saved.materialId)) materialChoices.push(saved);
  }
  const activeMaterials = materials.filter((item) => item.materialId || item.query.trim() || item.quantity !== "1");
  const materialInput = activeMaterials.map((item) => ({ materialId: item.materialId, quantity: Number(item.quantity) }));
  const materialValidation = orderMaterialsSchema.safeParse(materialInput);
  const materialsCostCents = materialValidation.success
    ? activeMaterials.reduce((total, item) => total + materialLineCost(materialChoices.find((option) => option.materialId === item.materialId)!.unitCostCents, Number(item.quantity)), 0) : null;
  const grocery = buildGroceryList({ orderItems: validItems, recipes: props.groceryRecipes ?? [] });
  const hasUnavailableRecipes = validItems.some((item) => !props.groceryRecipes?.some((recipe) => recipe.id === item.recipeId));

  useEffect(() => {
    if (validationError) errorRef.current?.focus();
  }, [validationError]);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (!details.totalCost.trim()) {
      setValidationError("Order total is required.");
      return;
    }
    const totalCostCents = dollarsInputToCents(details.totalCost);
    if (totalCostCents === null) {
      setValidationError("Enter a valid order total with up to 2 decimal places.");
      return;
    }
    if (validItems.length === 0) {
      setValidationError("Add at least one recipe.");
      return;
    }
    if (validItems.length !== items.length) {
      setValidationError("Select a recipe in each row, or remove the empty row.");
      return;
    }
    if (activeMaterials.some((item) => !item.materialId)) {
      setValidationError("Select a material in each started row, or remove the row.");
      return;
    }
    if (!materialValidation.success) {
      setValidationError(materialValidation.error.issues[0]!.message);
      return;
    }
    setSubmitting(true);
    setValidationError(null);
    setToastMessage(null);

    const payload = {
      name,
      notes: notes || undefined,
      totalCostCents,
      customerName: details.customerName,
      customerContact: details.customerContact,
      dueDate: details.dueDate,
      dueTime: details.dueTime,
      fulfillmentMethod: details.fulfillmentMethod,
      deliveryAddress:
        details.fulfillmentMethod === "DELIVERY" ? details.deliveryAddress : "",
      status: details.status,
      items: validItems.map((i) => ({ recipeId: i.recipeId, batches: i.batches })),
      materials: materialValidation.data,
    };

    try {
      if (isEdit) {
        const { error: err } = await actions.orders.update({
          id: props.orderId,
          ...payload,
        });
        if (err) {
          const message = getSafeActionErrorMessage(err, SAVE_ERROR_FALLBACK);
          if (isBadRequestActionError(err)) setValidationError(message);
          else setToastMessage(message);
          setSubmitting(false);
          return;
        }
        window.location.href = `/orders/${props.orderId}`;
      } else {
        const { data, error: err } = await actions.orders.create(payload);
        if (err) {
          const message = getSafeActionErrorMessage(err, SAVE_ERROR_FALLBACK);
          if (isBadRequestActionError(err)) setValidationError(message);
          else setToastMessage(message);
          setSubmitting(false);
          return;
        }
        window.location.href = `/orders/${data!.id}`;
      }
    } catch {
      setToastMessage(SAVE_ERROR_FALLBACK);
      setSubmitting(false);
    }
  }

  if (creatingMaterial !== null) return <section className="space-y-6" aria-label="Create material for order">
    <h2 className="font-display text-2xl" tabIndex={-1} ref={(node) => node?.focus()}>New material for this order</h2>
    <MaterialForm onSaved={(material) => {
      setMaterialOptions((options) => [...options, material]);
      setMaterials((rows) => rows.map((row, index) => index === creatingMaterial
        ? { ...row, materialId: material.id, query: "" } : row));
      returnToOrder();
    }} onCancel={returnToOrder} />
  </section>;

  return (
    <form onSubmit={handleSubmit} className="w-full min-w-0 space-y-6">
      {validationError && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-body text-destructive">
          {validationError}
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
          setValidationError(null);
        }}
      />

      <div ref={materialsRef} tabIndex={-1}>
        <OrderMaterialsEditor options={materialChoices} items={materials} onChange={(next) => {
          setMaterials(next);
          setValidationError(null);
        }} onCreate={setCreatingMaterial} />
      </div>
      <OrderCostSummary grocery={grocery} materialsCostCents={materialsCostCents} hasUnavailableRecipes={hasUnavailableRecipes} />

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
      <MobileFormActions className="flex-row-reverse sm:flex-row sm:justify-start sm:gap-3">
        <Button
          type="submit"
          disabled={submitting}
          className={mobileFormActionButtonClass}
        >
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
          className={mobileFormActionButtonClass}
        >
          Cancel
        </Button>
      </MobileFormActions>
      <ErrorToast message={toastMessage} onDismiss={dismissToast} />
    </form>
  );
}
