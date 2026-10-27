import { useId, useRef, useState, type SetStateAction } from "react";
import { arrayMove } from "@dnd-kit/helpers";

export interface RecipeEditorRow<T> {
  id: string;
  value: T;
}

export function useRecipeEditorRows<T>(initial: readonly T[], emptyValue: () => T) {
  const listId = useId();
  const nextId = useRef(Math.max(initial.length, 1));
  const [rows, setRows] = useState<RecipeEditorRow<T>[]>(() =>
    (initial.length > 0 ? initial : [emptyValue()]).map((value, index) => ({
      id: `${listId}-${index}`,
      value,
    })),
  );

  function add() {
    const row = { id: `${listId}-${nextId.current++}`, value: emptyValue() };
    setRows((current) => [...current, row]);
    return row.id;
  }

  function update(id: string, value: SetStateAction<T>) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              value: typeof value === "function"
                ? (value as (previous: T) => T)(row.value)
                : value,
            }
          : row,
      ),
    );
  }

  function remove(id: string) {
    setRows((current) =>
      current.length > 1 ? current.filter((row) => row.id !== id) : current,
    );
  }

  function move(id: string, to: number) {
    setRows((current) => {
      const from = current.findIndex((row) => row.id === id);
      if (from < 0 || to < 0 || to >= current.length || from === to) return current;
      return arrayMove(current, from, to);
    });
  }

  return { rows, add, update, remove, move };
}
