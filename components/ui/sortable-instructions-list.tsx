"use client";

import { useId, useLayoutEffect, useRef } from "react";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppIcon, ICON_BUTTON_CLASS } from "@/components/ui/icons";
import {
  SortableDragHandle,
  SortableItemRoot,
  SortableListProvider,
  SortableRow,
  useSortableListItem,
} from "@/components/ui/sortable-list";
import { cn } from "@/lib/cn";

const TOUCH_TARGET = "min-h-[44px] min-w-[44px]";
const BADGE_BASE =
  "h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground";

/** ~5 lines mobile / ~2 lines sm+ at text-base + py-3 (see plan: line-height × lines + vertical padding). */
const INSTRUCTION_TEXTAREA_MIN_H =
  "max-sm:min-h-36 sm:min-h-[4.5rem] leading-normal";

type LineFieldElement = HTMLInputElement | HTMLTextAreaElement;

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
  /** When true, Enter in a row inserts a new empty row below and focuses it. */
  insertBelowOnEnter?: boolean;
  /**
   * When true (and `insertBelowOnEnter`), Enter splits the line at the caret: text before
   * the caret stays on this row, text after (or after a selection) moves to the new row below.
   */
  splitLineAtCaretOnEnter?: boolean;
  /** Use multiline textarea for long steps (instructions); default single-line input (e.g. ingredients). */
  fieldVariant?: "input" | "textarea";
};

type InstructionTextareaSortableRowProps = {
  id: number;
  index: number;
  item: string;
  formInputName?: string;
  formInputError: boolean;
  placeholder: string;
  removeLabel: string;
  canRemove: boolean;
  insertBelowOnEnter: boolean;
  lineRowKey: (i: number) => string;
  onUpdate: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onLineEnter: (rowIndex: number, e: React.KeyboardEvent<LineFieldElement>) => void;
};

function InstructionTextareaSortableRow({
  id,
  index,
  item,
  formInputName,
  formInputError,
  placeholder,
  removeLabel,
  canRemove,
  insertBelowOnEnter,
  lineRowKey,
  onUpdate,
  onRemove,
  onLineEnter,
}: InstructionTextareaSortableRowProps) {
  const sortable = useSortableListItem(id);
  const style = {
    transform: DndCSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const dragHandleAriaLabel = `${removeLabel.replace("Remove ", "Reorder ")} ${index + 1}`;

  const deleteButton = (className: string) => (
    <Button
      type="button"
      variant="ghost"
      className={cn(ICON_BUTTON_CLASS, TOUCH_TARGET, className)}
      onClick={() => onRemove(index)}
      aria-label={removeLabel}
      disabled={!canRemove}
    >
      <AppIcon name="delete" size={18} aria-hidden />
    </Button>
  );

  const textareaEl = (
    <>
      {formInputName ? (
        <>
          <input type="hidden" name={formInputName} value={item} readOnly />
          <Textarea
            value={item}
            onChange={(e) => onUpdate(index, e.target.value)}
            onKeyDown={
              insertBelowOnEnter ? (e) => onLineEnter(index, e) : undefined
            }
            data-sortable-line-row={
              insertBelowOnEnter ? lineRowKey(index) : undefined
            }
            placeholder={placeholder}
            error={!!formInputError}
            className={cn(
              "min-w-0 w-full flex-1 resize-y",
              INSTRUCTION_TEXTAREA_MIN_H,
            )}
          />
        </>
      ) : (
        <Textarea
          value={item}
          onChange={(e) => onUpdate(index, e.target.value)}
          onKeyDown={
            insertBelowOnEnter ? (e) => onLineEnter(index, e) : undefined
          }
          data-sortable-line-row={
            insertBelowOnEnter ? lineRowKey(index) : undefined
          }
          placeholder={placeholder}
          className={cn(
            "min-w-0 w-full flex-1 resize-y",
            INSTRUCTION_TEXTAREA_MIN_H,
          )}
        />
      )}
    </>
  );

  return (
    <SortableItemRoot
      setNodeRef={sortable.setNodeRef}
      style={style}
      isDragging={sortable.isDragging}
      className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3"
    >
      <div className="order-1 flex min-w-0 w-full flex-1 flex-wrap items-start gap-2 sm:order-2 sm:flex-nowrap sm:gap-3">
        <span
          className={cn(BADGE_BASE, "mt-0 hidden sm:flex")}
          aria-hidden
        >
          {index + 1}
        </span>
        {textareaEl}
        {deleteButton("max-sm:hidden sm:mt-1")}
      </div>
      <div className="order-2 flex shrink-0 items-center gap-2 sm:order-1">
        <SortableDragHandle
          setActivatorNodeRef={sortable.setActivatorNodeRef}
          attributes={sortable.attributes}
          listeners={sortable.listeners}
          ariaLabel={dragHandleAriaLabel}
        />
        {deleteButton("sm:hidden")}
      </div>
    </SortableItemRoot>
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
  insertBelowOnEnter = false,
  splitLineAtCaretOnEnter = false,
  fieldVariant = "input",
}: SortableInstructionsListProps) {
  const lineRowScope = useId().replace(/:/g, "");
  const lineRowKey = (i: number) => `${lineRowScope}-${i}`;
  const list = items.length === 0 ? [""] : items;
  const canRemove = list.length > minItems;
  const isTextarea = fieldVariant === "textarea";
  const pendingFocusRef = useRef<{
    key: string;
    caret?: { start: number; end: number };
  } | null>(null);

  const updateAt = (index: number, value: string) => {
    const next = [...(items.length === 0 ? [""] : items)];
    next[index] = value;
    onItemsChange(next);
  };

  const removeAt = (index: number) => {
    const next = (items.length === 0 ? [""] : items).filter((_, i) => i !== index);
    onItemsChange(next.length === 0 ? [""] : next);
  };

  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    const el = document.querySelector<LineFieldElement>(
      `[data-sortable-line-row="${CSS.escape(pending.key)}"]`,
    );
    if (!el) return;
    el.focus();
    if (pending.caret) {
      const { start, end } = pending.caret;
      try {
        el.setSelectionRange(start, end);
      } catch {
        /* ignore invalid range */
      }
    }
  }, [items]);

  const handleLineEnter = (rowIndex: number, e: React.KeyboardEvent<LineFieldElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    const input = e.currentTarget;
    const value = input.value;
    const selStart = input.selectionStart ?? value.length;
    const selEnd = input.selectionEnd ?? selStart;
    let before: string;
    let after: string;
    if (splitLineAtCaretOnEnter) {
      before = value.slice(0, selStart);
      after = value.slice(selEnd);
    } else {
      before = value;
      after = "";
    }
    const base = items.length === 0 ? [""] : [...items];
    base[rowIndex] = before;
    base.splice(rowIndex + 1, 0, after);
    const nextKey = lineRowKey(rowIndex + 1);
    pendingFocusRef.current = {
      key: nextKey,
      caret: { start: 0, end: 0 },
    };
    onItemsChange(base);
  };

  const rowAlignClass = isTextarea ? "items-start" : "items-center";
  const innerRowAlignClass = isTextarea ? "items-start" : "items-center";

  return (
    <SortableListProvider items={list} onReorder={(next) => onItemsChange(next.length === 0 ? [""] : next)}>
      <ol className="mt-2 list-none space-y-4 p-0" role="list">
        {list.map((item, i) => (
          <li key={i}>
            {isTextarea ? (
              <InstructionTextareaSortableRow
                id={i}
                index={i}
                item={item}
                formInputName={formInputName}
                formInputError={!!formInputError}
                placeholder={placeholder}
                removeLabel={removeLabel}
                canRemove={canRemove}
                insertBelowOnEnter={insertBelowOnEnter}
                lineRowKey={lineRowKey}
                onUpdate={updateAt}
                onRemove={removeAt}
                onLineEnter={handleLineEnter}
              />
            ) : (
              <SortableRow
                id={i}
                dragHandleAriaLabel={`${removeLabel.replace("Remove ", "Reorder ")} ${i + 1}`}
                className="flex-nowrap"
              >
                <div
                  className={cn(
                    "flex min-w-0 w-full gap-2 sm:gap-3 flex-wrap sm:flex-nowrap",
                    rowAlignClass,
                  )}
                >
                  <span
                    className={cn(BADGE_BASE, "flex")}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div
                    className={cn(
                      "min-w-0 flex-1 flex gap-2 flex-wrap sm:flex-nowrap",
                      innerRowAlignClass,
                    )}
                  >
                    {formInputName ? (
                      <>
                        <input type="hidden" name={formInputName} value={item} readOnly />
                        <Input
                          value={item}
                          onChange={(e) => updateAt(i, e.target.value)}
                          onKeyDown={
                            insertBelowOnEnter
                              ? (e) => handleLineEnter(i, e)
                              : undefined
                          }
                          data-sortable-line-row={
                            insertBelowOnEnter ? lineRowKey(i) : undefined
                          }
                          placeholder={placeholder}
                          error={!!formInputError}
                          className="flex-1 min-w-0"
                        />
                      </>
                    ) : (
                      <Input
                        value={item}
                        onChange={(e) => updateAt(i, e.target.value)}
                        onKeyDown={
                          insertBelowOnEnter
                            ? (e) => handleLineEnter(i, e)
                            : undefined
                        }
                        data-sortable-line-row={
                          insertBelowOnEnter ? lineRowKey(i) : undefined
                        }
                        placeholder={placeholder}
                        className="flex-1 min-w-0"
                      />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(ICON_BUTTON_CLASS, TOUCH_TARGET)}
                      onClick={() => removeAt(i)}
                      aria-label={removeLabel}
                      disabled={!canRemove}
                    >
                      <AppIcon name="delete" size={18} aria-hidden />
                    </Button>
                  </div>
                </div>
              </SortableRow>
            )}
          </li>
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
    </SortableListProvider>
  );
}
