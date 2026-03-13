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

/**
 * Provider for drag-to-reorder lists. Wrap a list of SortableRow and handle reorder via onReorder.
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
    })
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
 * A single sortable row. Renders a grip handle and children. Use inside SortableListProvider.
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
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap",
        isDragging && "opacity-50 z-10",
        className
      )}
    >
      <span
        ref={setActivatorNodeRef}
        className={cn(
          "flex items-center justify-center rounded touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0",
          TOUCH_TARGET
        )}
        {...attributes}
        {...listeners}
        aria-label={dragHandleAriaLabel}
      >
        <GripVertical size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
