// @vitest-environment jsdom

import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { useEffect } from "react";
import { useDragDropManager, type DragDropManager } from "@dnd-kit/react";

import { SortableRecipeList } from "./SortableRecipeList";
import { useRecipeEditorRows } from "./useRecipeEditorRows";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function ManagerProbe({ onReady }: { onReady: (manager: DragDropManager) => void }) {
  const manager = useDragDropManager();
  useEffect(() => {
    if (manager) onReady(manager);
  }, [manager, onReady]);
  return null;
}

function TestEditor({
  disabled = false,
  initial = ["Flour", "Eggs", "Milk"],
  onManager,
  onSave,
}: {
  disabled?: boolean;
  initial?: string[];
  onManager?: (manager: DragDropManager) => void;
  onSave?: (values: string[]) => void;
}) {
  const items = useRecipeEditorRows(initial, () => "");
  return (
    <>
      <SortableRecipeList
        kind="ingredient"
        rows={items.rows}
        disabled={disabled}
        onAdd={items.add}
        onMove={items.move}
        onRemove={items.remove}
        getText={(value) => value}
      >
        {(row, index) => (
          <>
            {index === 0 && onManager && <ManagerProbe onReady={onManager} />}
            <input
              id={row.id}
              aria-label="Ingredient"
              value={row.value}
              onChange={(event) => items.update(row.id, event.target.value)}
            />
          </>
        )}
      </SortableRecipeList>
      {onSave && (
        <button type="button" onClick={() => onSave(items.rows.map((row) => row.value))}>
          Save order
        </button>
      )}
    </>
  );
}

function TestStepList() {
  const steps = useRecipeEditorRows(["Mix"], () => "");
  return (
    <SortableRecipeList
      kind="step"
      rows={steps.rows}
      onAdd={steps.add}
      onMove={steps.move}
      onRemove={steps.remove}
      getText={(value) => value}
    >
      {({ id, value }) => (
        <textarea id={id} value={value} onChange={(event) => steps.update(id, event.target.value)} />
      )}
    </SortableRecipeList>
  );
}

function mockDragEnvironment() {
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  for (const [prototype, name, value] of [
    [Element.prototype, "getAnimations", () => []],
    [Document.prototype, "getAnimations", () => []],
    [Element.prototype, "animate", () => ({ finished: Promise.resolve(), cancel() {} })],
  ] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    Object.defineProperty(prototype, name, { configurable: true, value });
    onTestFinished(() => {
      if (descriptor) Object.defineProperty(prototype, name, descriptor);
      else Reflect.deleteProperty(prototype, name);
    });
  }
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const row = this.closest("[data-recipe-row]");
    const index = row?.parentElement
      ? Array.from(row.parentElement.children).indexOf(row)
      : 0;
    return DOMRect.fromRect({ x: 0, y: 100 + index * 120, width: 300, height: 100 });
  });
}

function values() {
  return screen.getAllByRole("textbox").map((input) => (input as HTMLInputElement).value);
}

describe("SortableRecipeList", () => {
  it("hides ingredient row headings while keeping reorder controls labeled", () => {
    render(<TestEditor />);
    const firstRow = screen.getAllByRole("listitem")[0];
    const heading = firstRow?.querySelector("span.sr-only");

    expect(heading?.textContent).toBe("Ingredient 1");
    expect(heading?.className).toBe("sr-only");
    expect(firstRow?.querySelector(".inline-flex")).toBeNull();
    expect(screen.getByRole("button", { name: "Reorder ingredient 1" })).toBeTruthy();
  });

  it("uses the existing solid secondary variant for ingredient and step add buttons", () => {
    render(<><TestEditor /><TestStepList /></>);

    for (const name of ["Add ingredient", "Add step"]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("border-[1.5px]");
      expect(button.className).toContain("border-outline-strong");
      expect(button.className).not.toContain("border-dashed");
    }
  });

  it("does not show blank drag overlay cards while idle", () => {
    render(<><TestEditor /><TestStepList /></>);
    const overlays = document.querySelectorAll("[data-dnd-overlay]");

    expect(overlays).toHaveLength(2);
    for (const overlay of overlays) {
      expect(overlay.className).toBe("");
      expect(overlay.childElementCount).toBe(0);
    }
  });

  it("moves rows with tap controls while keeping the same input and focus", async () => {
    const user = userEvent.setup();
    render(<TestEditor />);
    const eggs = screen.getAllByRole("textbox")[1];
    const move = screen.getByRole("button", { name: "Move ingredient 2 up" });

    await user.click(move);

    expect(values()).toEqual(["Eggs", "Flour", "Milk"]);
    expect(screen.getAllByRole("textbox")[0]).toBe(eggs);
    expect(document.activeElement).toBe(move);
    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Ingredient order" }).textContent)
        .toContain("moved to position 1 of 3");
    });
  });

  it("republishes announcements for identical consecutive positional moves", async () => {
    const user = userEvent.setup();
    render(<TestEditor />);
    const status = screen.getByRole("status", { name: "Ingredient order" });
    await user.click(screen.getByRole("button", { name: "Move ingredient 2 up" }));
    await waitFor(() => expect(status.textContent).toContain("moved to position 1 of 3"));
    const changes: string[] = [];
    const observer = new MutationObserver(() => changes.push(status.textContent ?? ""));
    observer.observe(status, { childList: true, characterData: true, subtree: true });

    try {
      await user.click(screen.getByRole("button", { name: "Move ingredient 2 up" }));
      await waitFor(() => expect(changes).toContain("Ingredient 2 moved to position 1 of 3."));
      expect(changes).toContain("");
    } finally {
      observer.disconnect();
    }
  });

  it("reorders with the real keyboard sensor and cancels without changing the order", async () => {
    mockDragEnvironment();
    const user = userEvent.setup();
    render(<TestEditor />);
    const handle = screen.getByRole("button", { name: "Reorder ingredient 2" });
    expect(handle.className).not.toContain("border-border");
    expect(handle.className).not.toContain("bg-muted/50");
    expect(handle.className).toContain("hover:bg-transparent");
    expect(handle.className).toContain("active:bg-transparent");
    handle.focus();

    await user.keyboard("[Space]");
    await waitFor(() => expect(handle.getAttribute("aria-pressed")).toBe("true"));
    const overlay = document.querySelector("[data-dnd-overlay]");
    await waitFor(() => expect(overlay?.querySelector(".border-primary")).toBeTruthy());
    await user.keyboard("[ArrowUp]");
    await waitFor(() => expect(values()).toEqual(["Eggs", "Flour", "Milk"]));
    await user.keyboard("[Space]");
    await waitFor(() => expect(handle.getAttribute("aria-pressed")).toBe("false"));
    expect(values()).toEqual(["Eggs", "Flour", "Milk"]);

    handle.focus();
    await user.keyboard("[Space]");
    await waitFor(() => expect(handle.getAttribute("aria-pressed")).toBe("true"));
    await user.keyboard("[ArrowDown]");
    await user.keyboard("[Escape]");
    await waitFor(() => expect(handle.getAttribute("aria-pressed")).toBe("false"));
    expect(values()).toEqual(["Eggs", "Flour", "Milk"]);
  });

  it("saves the displayed order when a drag finishes without a current drop target", async () => {
    mockDragEnvironment();
    const user = userEvent.setup();
    const save = vi.fn();
    let manager: DragDropManager;
    render(<TestEditor onManager={(value) => { manager = value; }} onSave={save} />);
    const handle = screen.getByRole("button", { name: "Reorder ingredient 2" });
    handle.focus();
    await user.keyboard("[Space]");
    await waitFor(() => expect(handle.getAttribute("aria-pressed")).toBe("true"));
    await user.keyboard("[ArrowUp]");
    await waitFor(() => expect(values()).toEqual(["Eggs", "Flour", "Milk"]));

    await act(async () => {
      manager.collisionObserver.disable();
      await manager.actions.setDropTarget(null);
    });
    expect(manager!.dragOperation.target).toBeNull();
    await user.keyboard("[Space]");
    await waitFor(() => expect(handle.getAttribute("aria-pressed")).toBe("false"));
    await user.click(screen.getByRole("button", { name: "Save order" }));

    expect(values()).toEqual(["Eggs", "Flour", "Milk"]);
    expect(save).toHaveBeenCalledWith(["Eggs", "Flour", "Milk"]);
  });

  it("keeps editing and removal attached to a row after it moves", async () => {
    const user = userEvent.setup();
    render(<TestEditor initial={["Flour", "Flour", "Milk"]} />);
    const second = screen.getAllByRole("textbox")[1];
    await user.type(second, " for dusting");
    await user.click(screen.getByRole("button", { name: "Move ingredient 2 up" }));
    await user.click(screen.getByRole("button", { name: "Remove ingredient 2" }));

    expect(values()).toEqual(["Flour for dusting", "Milk"]);
    expect(screen.getAllByRole("textbox")[0]).toBe(second);
  });

  it("focuses added rows and never reuses a removed row's identity", async () => {
    const user = userEvent.setup();
    render(<TestEditor />);
    const removedId = screen.getAllByRole("textbox")[2].id;

    await user.click(screen.getByRole("button", { name: "Remove ingredient 3" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));

    const added = screen.getAllByRole("textbox")[2];
    await waitFor(() => expect(document.activeElement).toBe(added));
    expect(added.id).not.toBe(removedId);
    await user.type(added, "Sugar");
    await user.click(screen.getByRole("button", { name: "Move ingredient 3 up" }));
    expect(values()).toEqual(["Flour", "Sugar", "Eggs"]);
    expect(screen.getAllByRole("textbox")[1]).toBe(added);
  });

  it("hydrates multiple lists with unique, unchanged input identities", async () => {
    const editor = <><TestEditor /><TestEditor /></>;
    const container = document.createElement("div");
    container.innerHTML = renderToString(editor);
    document.body.appendChild(container);
    const ids = Array.from(container.querySelectorAll("input"), (input) => input.id);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot>;

    try {
      await act(async () => {
        root = hydrateRoot(container, editor, { onRecoverableError });
      });

      expect(new Set(ids).size).toBe(6);
      expect(Array.from(container.querySelectorAll("input"), (input) => input.id)).toEqual(ids);
      expect(onRecoverableError).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("disables every reordering control while saving", () => {
    render(<TestEditor disabled />);
    const list = screen.getByRole("list", { name: "Ingredients" });
    for (const button of within(list).getAllByRole("button")) {
      expect(button).toHaveProperty("disabled", true);
    }
    expect(screen.getByRole("button", { name: "Add ingredient" })).toHaveProperty("disabled", true);
  });

  it("disables movement and removal for the last row", () => {
    render(<TestEditor initial={["Flour"]} />);
    const list = screen.getByRole("list", { name: "Ingredients" });
    for (const button of within(list).getAllByRole("button")) {
      expect(button).toHaveProperty("disabled", true);
    }
  });
});
