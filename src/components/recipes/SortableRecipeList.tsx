import { useMemo, useState, type ReactNode } from "react";
import {
  Accessibility,
  PointerActivationConstraints,
  PointerSensor,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/dom";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { RecipeEditorRow } from "./useRecipeEditorRows";

type RowKind = "ingredient" | "step";

interface SortableRecipeListProps<T> {
  kind: RowKind;
  rows: RecipeEditorRow<T>[];
  disabled?: boolean;
  onAdd: () => string;
  onMove: (id: string, to: number) => void;
  onRemove: (id: string) => void;
  getText: (value: T) => string;
  children: (row: RecipeEditorRow<T>, index: number) => ReactNode;
}

const pointerSensor = PointerSensor.configure({
  activationConstraints(event) {
    return event.pointerType === "touch"
      ? [new PointerActivationConstraints.Delay({ value: 180, tolerance: 8 })]
      : [new PointerActivationConstraints.Distance({ value: 5 })];
  },
});

const accessibility = Accessibility.configure({
  screenReaderInstructions: {
    draggable:
      "Press Space or Enter to pick up this item. Use the up and down arrow keys to move it. Press Space or Enter to drop, or Escape to cancel. You can also use the move up and move down buttons.",
  },
  announcements: {
    dragstart({ operation: { source } }: DragStartEvent) {
      if (!isSortable(source)) return;
      return `${source.data.label} picked up. Position ${source.initialIndex + 1} of ${source.data.count}.`;
    },
    dragover({ operation: { source } }: DragOverEvent) {
      if (!isSortable(source)) return;
      return `${source.data.label}, position ${source.index + 1} of ${source.data.count}.`;
    },
    dragend({ canceled, operation: { source } }: DragEndEvent) {
      if (canceled) return "Reordering canceled. Order unchanged.";
      if (!isSortable(source)) return;
      return `${source.data.label} moved to position ${source.index + 1} of ${source.data.count}.`;
    },
  },
});

const controlClassName =
  "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-input text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-30 motion-reduce:transition-none";

function SortableRecipeRow({
  id,
  index,
  count,
  kind,
  text,
  disabled,
  dragging,
  onMove,
  onRemove,
  children,
}: {
  id: string;
  index: number;
  count: number;
  kind: RowKind;
  text: string;
  disabled: boolean;
  dragging: boolean;
  onMove: SortableRecipeListProps<unknown>["onMove"];
  onRemove: SortableRecipeListProps<unknown>["onRemove"];
  children: ReactNode;
}) {
  const label = `${kind === "ingredient" ? "Ingredient" : "Step"} ${index + 1}`;
  const data = useMemo(
    () => ({ label, text: text.trim() || label, count }),
    [label, text, count],
  );
  const { ref, handleRef, isDragSource } = useSortable({
    id,
    index,
    disabled: disabled || count < 2,
    data,
    transition: { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  });

  return (
    <li
      ref={ref}
      data-recipe-row={kind}
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card p-3 transition-[border-color,box-shadow] motion-reduce:transition-none sm:p-4",
        isDragSource && "border-primary/50 bg-primary/5 ring-2 ring-primary/15",
      )}
    >
      <div className="-mx-1 -mt-1 mb-2 flex items-center gap-1">
        <button
          ref={handleRef}
          type="button"
          disabled={disabled || count < 2}
          aria-label={`Reorder ${kind} ${index + 1}`}
          title="Hold and drag to reorder"
          className={cn(
            controlClassName,
            "touch-none select-none hover:bg-transparent active:cursor-grabbing active:bg-transparent enabled:cursor-grab",
          )}
        >
          <GripVertical className="size-5" aria-hidden="true" />
        </button>
        <span className="ml-1 min-w-0 flex-1 text-xs font-semibold text-muted-foreground">
          {kind === "ingredient" ? (
            <span className="sr-only">{label}</span>
          ) : (
            <>
              <span className="sr-only sm:not-sr-only">Step{" "}</span>
              <span className="inline-flex size-7 items-center justify-center rounded-full bg-secondary text-secondary-foreground sm:size-auto sm:bg-transparent sm:text-muted-foreground">
                {index + 1}
              </span>
            </>
          )}
        </span>
        <button
          type="button"
          aria-label={`Move ${kind} ${index + 1} up`}
          title="Move up"
          disabled={disabled || dragging || index === 0}
          onClick={() => onMove(id, index - 1)}
          className={controlClassName}
        >
          <ArrowUp className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Move ${kind} ${index + 1} down`}
          title="Move down"
          disabled={disabled || dragging || index === count - 1}
          onClick={() => onMove(id, index + 1)}
          className={controlClassName}
        >
          <ArrowDown className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Remove ${kind} ${index + 1}`}
          title={`Remove ${kind}`}
          disabled={disabled || dragging || count < 2}
          onClick={() => onRemove(id)}
          className={cn(
            controlClassName,
            "hover:bg-destructive/10 hover:text-destructive",
          )}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <fieldset disabled={disabled || dragging} className="min-w-0">
        {children}
      </fieldset>
    </li>
  );
}

export function SortableRecipeList<T>({
  kind,
  rows,
  disabled = false,
  onAdd,
  onMove,
  onRemove,
  getText,
  children,
}: SortableRecipeListProps<T>) {
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const List = kind === "step" ? "ol" : "ul";

  function moveRow(id: string, to: number) {
    const from = rows.findIndex((row) => row.id === id);
    if (disabled || from < 0 || to < 0 || to >= rows.length || from === to) return;
    onMove(id, to);
    setAnnouncement("");
    requestAnimationFrame(() => {
      setAnnouncement(
        `${kind === "ingredient" ? "Ingredient" : "Step"} ${from + 1} moved to position ${to + 1} of ${rows.length}.`,
      );
    });
  }

  return (
    <DragDropProvider
      sensors={(defaults) => [
        ...defaults.filter((sensor) => sensor !== PointerSensor),
        pointerSensor,
      ]}
      plugins={(defaults) => [...defaults, accessibility]}
      onDragStart={() => {
        setDragging(true);
        setAnnouncement("");
      }}
      onDragEnd={(event) => {
        setDragging(false);
        const { source } = event.operation;
        if (disabled || event.canceled || !isSortable(source)) return;
        onMove(String(source.id), source.index);
      }}
    >
      <p className="text-xs leading-relaxed text-muted-foreground">
        Hold the grip to drag, or use the arrows to reorder.
      </p>
      <List
        aria-label={kind === "ingredient" ? "Ingredients" : "Instructions"}
        className="space-y-3"
      >
        {rows.map((row, index) => (
          <SortableRecipeRow
            key={row.id}
            id={row.id}
            index={index}
            count={rows.length}
            kind={kind}
            text={getText(row.value)}
            disabled={disabled}
            dragging={dragging}
            onMove={moveRow}
            onRemove={onRemove}
          >
            {children(row, index)}
          </SortableRecipeRow>
        ))}
      </List>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || dragging}
        className="min-h-11 w-full sm:w-auto"
        onClick={() => {
          const id = onAdd();
          requestAnimationFrame(() => document.getElementById(id)?.focus());
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add {kind}
      </Button>
      <span
        role="status"
        aria-label={`${kind === "ingredient" ? "Ingredient" : "Step"} order`}
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </span>
      <DragOverlay
        dropAnimation={{ duration: 160, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        style={{ height: "auto", maxWidth: "24rem" }}
      >
        {(source) => (
          <div
            aria-hidden="true"
            className="flex items-center gap-3 rounded-xl border-2 border-primary bg-card p-3 text-card-foreground shadow-lg"
          >
            <GripVertical className="size-5 shrink-0 text-primary-on-card" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-primary-on-card">{source.data.label}</p>
              <p className="line-clamp-2 break-words text-sm">{source.data.text}</p>
            </div>
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  );
}
