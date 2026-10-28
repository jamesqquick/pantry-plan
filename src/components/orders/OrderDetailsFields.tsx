import { ShoppingBag, Truck } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  ORDER_FULFILLMENT_METHODS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type OrderFulfillmentMethod,
  type OrderStatus,
} from "@/db/schema/enums";

export interface OrderDetailsFormValues {
  customerName: string;
  customerContact: string;
  dueDate: string;
  dueTime: string;
  fulfillmentMethod: OrderFulfillmentMethod;
  deliveryAddress: string;
  status: OrderStatus;
}

interface OrderDetailsFieldsProps {
  name: string;
  onNameChange: (name: string) => void;
  details: OrderDetailsFormValues;
  onDetailsChange: (patch: Partial<OrderDetailsFormValues>) => void;
}

const FULFILLMENT_LABELS: Record<OrderFulfillmentMethod, string> = {
  PICKUP: "Pickup",
  DELIVERY: "Delivery",
};

export function OrderDetailsFields({
  name,
  onNameChange,
  details,
  onDetailsChange,
}: OrderDetailsFieldsProps) {
  return (
    <div className="space-y-7">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
        <div>
          <label htmlFor="order-name" className="mb-1 block text-sm font-medium text-foreground">
            Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="order-name"
            autoComplete="off"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="e.g. Sarah's birthday cookies"
            maxLength={200}
            required
          />
        </div>
        <div>
          <label htmlFor="order-status" className="mb-1 block text-sm font-medium text-foreground">
            Order status
          </label>
          <select
            id="order-status"
            value={details.status}
            onChange={(event) => onDetailsChange({ status: event.target.value as OrderStatus })}
            className="flex h-10 w-full cursor-pointer rounded-input border border-input bg-card px-3 py-1.5 font-ui text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="space-y-4 border-t border-border pt-6" aria-labelledby="order-customer-heading">
        <h2 id="order-customer-heading" className="font-display text-xl text-foreground">
          Customer <span className="font-ui text-xs font-normal text-muted-foreground">Optional</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="customer-name" className="mb-1 block text-sm font-medium text-foreground">
              Customer name
            </label>
            <Input
              id="customer-name"
              autoComplete="name"
              value={details.customerName}
              onChange={(event) => onDetailsChange({ customerName: event.target.value })}
              maxLength={200}
              placeholder="Who is the order for?"
            />
          </div>
          <div>
            <label htmlFor="customer-contact" className="mb-1 block text-sm font-medium text-foreground">
              Phone or email
            </label>
            <Input
              id="customer-contact"
              autoComplete="email"
              value={details.customerContact}
              onChange={(event) => onDetailsChange({ customerContact: event.target.value })}
              maxLength={254}
              placeholder="How can you reach them?"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6" aria-labelledby="order-fulfillment-heading">
        <h2 id="order-fulfillment-heading" className="font-display text-xl text-foreground">
          Fulfillment <span className="font-ui text-xs font-normal text-muted-foreground">Optional</span>
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="due-date" className="mb-1 block text-sm font-medium text-foreground">
              Due date
            </label>
            <Input
              id="due-date"
              type="date"
              value={details.dueDate}
              onChange={(event) => onDetailsChange({ dueDate: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor="due-time" className="mb-1 block text-sm font-medium text-foreground">
              Time <span className="font-normal text-muted-foreground">Optional</span>
            </label>
            <Input
              id="due-time"
              type="time"
              value={details.dueTime}
              onChange={(event) => onDetailsChange({ dueTime: event.target.value })}
            />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Pickup or delivery</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {ORDER_FULFILLMENT_METHODS.map((method) => {
              const selected = details.fulfillmentMethod === method;
              const Icon = method === "PICKUP" ? ShoppingBag : Truck;
              return (
                <label
                  key={method}
                  htmlFor={`fulfillment-${method.toLowerCase()}`}
                  className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-input border px-3 py-2.5 transition-colors ${
                    selected
                      ? "border-outline-strong bg-accent"
                      : "border-border bg-card hover:bg-primary/5"
                  }`}
                >
                  <input
                    id={`fulfillment-${method.toLowerCase()}`}
                    type="radio"
                    name="fulfillmentMethod"
                    value={method}
                    checked={selected}
                    onChange={() => onDetailsChange({ fulfillmentMethod: method })}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">
                      {FULFILLMENT_LABELS[method]}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {method === "PICKUP" ? "Customer collects" : "Deliver to customer"}
                    </span>
                  </span>
                  <Icon className="ml-auto h-5 w-5 shrink-0 text-primary-icon-fg" aria-hidden="true" />
                </label>
              );
            })}
          </div>
        </fieldset>

        {details.fulfillmentMethod === "DELIVERY" && (
          <div>
            <label htmlFor="delivery-address" className="mb-1 block text-sm font-medium text-foreground">
              Delivery address <span className="font-normal text-muted-foreground">Optional</span>
            </label>
            <Textarea
              id="delivery-address"
              autoComplete="street-address"
              value={details.deliveryAddress}
              onChange={(event) => onDetailsChange({ deliveryAddress: event.target.value })}
              maxLength={1_000}
              rows={2}
              placeholder="Street address, apartment, city, and postal code"
            />
          </div>
        )}
      </section>
    </div>
  );
}
