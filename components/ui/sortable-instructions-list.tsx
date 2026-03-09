"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppIcon, ICON_BUTTON_CLASS } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const TOUCH_TARGET = "min-h-[44px] min-w-[44px]";
const BADGE_CLASS =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground";

export type SortableInstructionsListProps = {
  items: string[];
  onItemsChange: (items: string[]) => void;
  placeholder?: string;
  removeLabel: string;
  addLabel?: string;
  minItems?: number;
  /** When set, render form inputs with name and defaultValue for FormData submit order */
  formInputName?: string;
  formInputError?: boolean;
  onAdd?: () => void;
};

function SortableInstructionRow({
  id,
  index,
  value,
  placeholder,
  removeLabel,
  canRemove,
  formInputName,
  formInputError,
  onRemove,
  onValueChange,
}: {
  id: number;
  index: number;
  value: string;
  placeholder: string;
  removeLabel: string;
  canRemove: boolean;
  formInputName?: string;
  formInputError?: boolean;
  onRemove: () => void;
  onValueChange?: (value: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap",
        isDragging && "opacity-50 z-10"
      )}
    >
      <span
        ref={setActivatorNodeRef}
        className={cn(
          "flex items-center justify-center rounded touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground",
          TOUCH_TARGET
        )}
        {...attributes}
        {...listeners}
        aria-label={`${removeLabel.replace("Remove ", "Reorder ")} ${index + 1}`}
      >
        <GripVertical size={20} aria-hidden />
      </span>
      <span className={cn(BADGE_CLASS)} aria-hidden>
        {index + 1}
      </span>
      <div className="min-w-0 flex-1 flex gap-2 flex-wrap sm:flex-nowrap">
        {formInputName ? (
          <>
            <input
              type="hidden"
              name={formInputName}
              value={value}
              readOnly
            />
            <Input
              value={value}
              onChange={(e) => onValueChange?.(e.target.value)}
              placeholder={placeholder}
              error={!!formInputError}
              className="flex-1 min-w-0"
            />
          </>
        ) : (
          <Input
            value={value}
            onChange={(e) => onValueChange?.(e.target.value)}
            placeholder={placeholder}
            className="flex-1 min-w-0"
          />
        )}
        <Button
          type="button"
          variant="ghost"
          className={cn(ICON_BUTTON_CLASS, TOUCH_TARGET)}
          onClick={onRemove}
          aria-label={removeLabel}
          disabled={!canRemove}
        >
          <AppIcon name="delete" size={18} aria-hidden />
        </Button>
      </div>
    </li>
  );
}

export function SortableInstructionsList({
  items,
  onItemsChange,
  placeholder = "Step description",
  removeLabel = "Remove step",
  addLabel = "Add step",
  minItems = 1,
  formInputName,
  formInputError,
  onAdd,
}: SortableInstructionsListProps) {
  const list = items.length === 0 ? [""] : items;
  const itemIds = list.map((_, i) => i);
  const canRemove = list.length > minItems;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over == null || active.id === over.id) return;
    const oldIndex = itemIds.indexOf(active.id as number);
    const newIndex = itemIds.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(list, oldIndex, newIndex);
    onItemsChange(next.length === 0 ? [""] : next);
  };

  const updateAt = (index: number, value: string) => {
    const next = [...(items.length === 0 ? [""] : items)];
    next[index] = value;
    onItemsChange(next);
  };

  const removeAt = (index: number) => {
    const next = (items.length === 0 ? [""] : items).filter((_, i) => i !== index);
    onItemsChange(next.length === 0 ? [""] : next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={itemIds}
        strategy={verticalListSortingStrategy}
      >
        <ol
          className="mt-2 list-none space-y-4 p-0"
          role="list"
        >
          {list.map((item, i) => (
            <SortableInstructionRow
              key={i}
              id={i}
              index={i}
              value={item}
              placeholder={placeholder}
              removeLabel={removeLabel}
              canRemove={canRemove}
              formInputName={formInputName}
              formInputError={formInputError}
              onRemove={() => removeAt(i)}
              onValueChange={(v) => updateAt(i, v)}
            />
          ))}
        </ol>
        {onAdd && (
          <Button
            type="button"
            variant="secondary"
            aria-label={addLabel}
            onClick={onAdd}
            className={cn("mt-4", ICON_BUTTON_CLASS, TOUCH_TARGET)}
          >
            <AppIcon name="add" size={18} aria-hidden />
          </Button>
        )}
      </SortableContext>
    </DndContext>
  );
}
