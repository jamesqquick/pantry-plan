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
import { cn } from "@/lib/cn";

const TOUCH_TARGET = "min-h-[44px] min-w-[44px]";

/** dnd-kit sortable state for one list item; use with SortableItemRoot + SortableDragHandle for custom layouts. */
export function useSortableListItem(id: number) {
  return useSortable({ id });
}

export type SortableListItem = ReturnType<typeof useSortableListItem>;

/** Outer wrapper: `setNodeRef`, drag transform, dragging opacity. */
export function SortableItemRoot({
  setNodeRef,
  style,
  isDragging,
  className,
  children,
}: {
  setNodeRef: SortableListItem["setNodeRef"];
  style: React.CSSProperties;
  isDragging: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-50 z-10", className)}
    >
      {children}
    </div>
  );
}

/** Grip that activates drag; must stay the `setActivatorNodeRef` target. */
export function SortableDragHandle({
  setActivatorNodeRef,
  attributes,
  listeners,
  ariaLabel = "Reorder",
  className,
}: {
  setActivatorNodeRef: SortableListItem["setActivatorNodeRef"];
  attributes: SortableListItem["attributes"];
  listeners: SortableListItem["listeners"];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <span
      ref={setActivatorNodeRef}
      className={cn(
        "flex items-center justify-center rounded touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0",
        TOUCH_TARGET,
        className,
      )}
      {...attributes}
      {...listeners}
      aria-label={ariaLabel}
    >
      <GripVertical size={20} aria-hidden />
    </span>
  );
}

/**
 * Provider for drag-to-reorder lists. Wrap sortable rows and handle reorder via onReorder.
 */
export function SortableListProvider<T>({
  items,
  onReorder,
  children,
}: {
  items: T[];
  onReorder: (reordered: T[]) => void;
  children: React.ReactNode;
}) {
  const itemIds = items.map((_, i) => i);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over == null || active.id === over.id) return;
    const oldIndex = itemIds.indexOf(active.id as number);
    const newIndex = itemIds.indexOf(over.id as number);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove([...items], oldIndex, newIndex));
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
        {children}
      </SortableContext>
    </DndContext>
  );
}

/**
 * Default horizontal row: grip + children. For custom layouts, use useSortableListItem + SortableItemRoot + SortableDragHandle.
 */
export function SortableRow({
  id,
  children,
  className,
  dragHandleAriaLabel = "Reorder",
}: {
  id: number;
  children: React.ReactNode;
  className?: string;
  dragHandleAriaLabel?: string;
}) {
  const sortable = useSortableListItem(id);
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <SortableItemRoot
      setNodeRef={sortable.setNodeRef}
      style={style}
      isDragging={sortable.isDragging}
      className={cn(
        "flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap",
        className,
      )}
    >
      <SortableDragHandle
        setActivatorNodeRef={sortable.setActivatorNodeRef}
        attributes={sortable.attributes}
        listeners={sortable.listeners}
        ariaLabel={dragHandleAriaLabel}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </SortableItemRoot>
  );
}
