// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeCookMode } from "./RecipeCookMode";

const recipe = {
  recipeId: "pasta",
  title: "Weeknight Pasta",
  servings: 4,
  meta: [
    { label: "Cook", value: "20m" },
  ],
  ingredients: [
    { id: "flour", quantity: 2, unit: "CUP" as const, displayText: "flour" },
    { id: "eggs", quantity: 3, unit: "COUNT" as const, displayText: "eggs" },
  ],
  instructions: ["Mix the dough.", "Cook until tender."],
};

class FakeWakeLockSentinel extends EventTarget {
  released = false;

  constructor(private readonly dispatchReleaseImmediately = true) {
    super();
  }

  async release() {
    if (this.released) return;
    this.released = true;
    if (this.dispatchReleaseImmediately) this.emitRelease();
  }

  emitRelease() {
    this.dispatchEvent(new Event("release"));
  }
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

function setWakeLock(request: () => Promise<FakeWakeLockSentinel>) {
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request: vi.fn(request) },
  });
  return navigator.wakeLock.request as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.body.style.overflow = "";
  setVisibility("visible");
  Reflect.deleteProperty(navigator, "wakeLock");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RecipeCookMode", () => {
  it("updates batch quantities and servings instantly without changing steps or timing", async () => {
    const user = userEvent.setup();
    render(<RecipeCookMode {...recipe} />);
    await user.click(screen.getByRole("button", { name: "Cook mode" }));

    for (const [scale, amount, servings] of [
      [0.5, "1 cup flour", 2], [1.5, "3 cups flour", 6],
      [2, "4 cups flour", 8], [3, "6 cups flour", 12], [4, "8 cups flour", 16],
    ] as const) {
      await user.click(screen.getByRole("radio", { name: `${scale}×` }));
      screen.getByRole("checkbox", { name: amount });
      expect(screen.getByRole("status").textContent).toContain(`Makes ${servings} servings`);
      screen.getByText("20m");
      screen.getByRole("checkbox", { name: "Step 1: Mix the dough." });
    }
    screen.getByText(/Steps and timing are for the original batch/);
    await user.click(screen.getByRole("radio", { name: "1×, original batch" }));
    screen.getByRole("checkbox", { name: "2 cups flour" });
    expect(screen.queryByText(/Steps and timing are for the original batch/)).toBeNull();
  });

  it("keeps checked state, DOM identity, focus, and the wake lock when scale changes", async () => {
    const user = userEvent.setup();
    const request = setWakeLock(async () => new FakeWakeLockSentinel());
    render(<RecipeCookMode {...recipe} />);
    await user.click(screen.getByRole("button", { name: "Cook mode" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    const ingredient = screen.getByRole("checkbox", { name: "2 cups flour" });
    await user.click(ingredient);
    await user.click(screen.getByRole("checkbox", { name: "Step 1: Mix the dough." }));
    ingredient.focus();
    fireEvent.click(screen.getByRole("radio", { name: "2×" }));

    expect(screen.getByRole("checkbox", { name: "4 cups flour" })).toBe(ingredient);
    expect((ingredient as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(ingredient);
    expect((screen.getByRole("checkbox", { name: "Step 1: Mix the dough." }) as HTMLInputElement).checked).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Exit" }));
    await user.click(screen.getByRole("button", { name: "Cook mode" }));
    expect((screen.getByRole("radio", { name: "1×, original batch" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "2 cups flour" }) as HTMLInputElement).checked).toBe(false);
  });

  it("scales text-only ingredients and identifies only amounts that need review", async () => {
    const user = userEvent.setup();
    render(<RecipeCookMode {...recipe} ingredients={[
      { id: "milk", quantity: null, unit: null, displayText: "1½ cups milk" },
      { id: "garlic", quantity: null, unit: null, displayText: "2-3 cloves garlic" },
      { id: "salt", quantity: null, unit: null, displayText: "Salt to taste" },
    ]} />);
    await user.click(screen.getByRole("button", { name: "Cook mode" }));
    expect(screen.queryByText("Check amount")).toBeNull();
    await user.click(screen.getByRole("radio", { name: "2×" }));
    screen.getByRole("checkbox", { name: "3 cups milk" });
    screen.getByRole("checkbox", { name: "2-3 cloves garlic" });
    screen.getByRole("checkbox", { name: "Salt to taste" });
    expect(screen.getAllByText("Check amount")).toHaveLength(1);
    screen.getByText("1 ingredient amount adjusted. 1 needs checking.");
    expect(screen.getByRole("link", { name: "Review quantities" }).getAttribute("href"))
      .toBe("/recipes/pasta/edit#recipe-ingredients");
  });

  it("preserves the reading position inside a partially visible long instruction", async () => {
    const user = userEvent.setup();
    const instruction = "Stir gently until the mixture comes together. ".repeat(40).trim();
    render(<RecipeCookMode {...recipe} instructions={[instruction]} />);
    await user.click(screen.getByRole("button", { name: "Cook mode" }));
    const panel = screen.getByRole("dialog");
    const step = screen.getByRole("checkbox", { name: `Step 1: ${instruction}` });
    const label = step.closest("label")!;
    const scale = screen.getByRole("radio", { name: "2×" }) as HTMLInputElement;
    Object.defineProperty(panel, "clientHeight", { value: 812 });
    vi.spyOn(panel.querySelector("header")!, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(0, 0, 375, 160));
    vi.spyOn(label, "getBoundingClientRect").mockImplementation(() => {
      const expansion = screen.getByRole("status").textContent?.includes("Makes 8 servings") ? 100 : 0;
      return new DOMRect(0, 200 + expansion - panel.scrollTop, 335, 1200);
    });
    panel.scrollTop = 400;
    step.focus();

    fireEvent.click(scale);

    expect(panel.scrollTop).toBe(500);
    expect(label.getBoundingClientRect().top).toBe(-200);
    expect(document.activeElement).toBe(step);
  });

  it("explains unavailable scaling without blocking the cooking view", async () => {
    const user = userEvent.setup();
    render(<RecipeCookMode {...recipe} ingredients={[
      { id: "salt", quantity: null, unit: null, displayText: "Salt to taste" },
    ]} />);
    await user.click(screen.getByRole("button", { name: "Cook mode" }));
    expect((screen.getByRole("radio", { name: "2×" }) as HTMLInputElement).disabled).toBe(true);
    screen.getByText("Add ingredient quantities to use batch scaling.");
    screen.getByRole("checkbox", { name: "Salt to taste" });
  });

  it("supports keyboard selection and recipes without base servings", async () => {
    // jsdom omits CSS.escape, which user-event needs to find a named radio group.
    vi.stubGlobal("CSS", { escape: (value: string) => value.replace(/[^\w-]/g, "\\$&") });
    const user = userEvent.setup();
    render(<RecipeCookMode {...recipe} servings={null} />);
    await user.click(screen.getByRole("button", { name: "Cook mode" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "1×, original batch" }));
    await user.keyboard("{ArrowRight}");
    expect((screen.getByRole("radio", { name: "1.5×" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("1.5× original recipe");
    expect(screen.getByRole("status").textContent).not.toContain("Makes");
  });

  it("opens an isolated cooking surface, tracks progress, and resets on exit", async () => {
    const user = userEvent.setup();
    const lock = new FakeWakeLockSentinel();
    const request = setWakeLock(async () => lock);
    const skipLink = document.createElement("a");
    skipLink.href = "#main-content";
    skipLink.textContent = "Skip to content";
    document.body.appendChild(skipLink);
    const { container } = render(<RecipeCookMode {...recipe} />);
    const trigger = screen.getByRole("button", { name: "Cook mode" });
    const initialUrl = window.location.href;

    await user.click(trigger);

    screen.getByRole("dialog", { name: recipe.title });
    expect(document.body.style.overflow).toBe("hidden");
    expect(skipLink.getAttribute("aria-hidden")).toBe("true");
    expect(container.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Exit" }),
    );
    expect(window.location.href).toBe(initialUrl);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "Step 2: Cook until tender." }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Exit" }),
    );

    await user.click(screen.getByRole("checkbox", { name: "2 cups flour" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Step 1: Mix the dough." }),
    );
    expect(
      (screen.getByRole("checkbox", { name: "2 cups flour" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Step 1: Mix the dough.",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(skipLink.hasAttribute("aria-hidden")).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(lock.released).toBe(true);

    await user.click(trigger);
    expect(
      (screen.getByRole("checkbox", { name: "2 cups flour" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(
      (
        screen.getByRole("checkbox", {
          name: "Step 1: Mix the dough.",
        }) as HTMLInputElement
      ).checked,
    ).toBe(false);
  });

  it("continues when wake lock is unsupported or denied", async () => {
    render(<RecipeCookMode {...recipe} />);
    fireEvent.click(screen.getByRole("button", { name: "Cook mode" }));
    expect(screen.getByRole("dialog", { name: recipe.title })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));

    const request = setWakeLock(async () => {
      throw new DOMException("Not allowed", "NotAllowedError");
    });
    fireEvent.click(screen.getByRole("button", { name: "Cook mode" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: recipe.title })).toBeTruthy();
  });

  it("releases and reacquires the wake lock across visibility changes", async () => {
    const firstLock = new FakeWakeLockSentinel();
    const secondLock = new FakeWakeLockSentinel();
    const request = setWakeLock(
      vi.fn().mockResolvedValueOnce(firstLock).mockResolvedValueOnce(secondLock),
    );
    render(<RecipeCookMode {...recipe} />);
    fireEvent.click(screen.getByRole("button", { name: "Cook mode" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    setVisibility("hidden");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(firstLock.released).toBe(true));

    setVisibility("visible");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    await waitFor(() => expect(secondLock.released).toBe(true));
  });

  it("ignores a stale release after a replacement wake lock is active", async () => {
    const firstLock = new FakeWakeLockSentinel(false);
    const secondLock = new FakeWakeLockSentinel();
    const request = setWakeLock(
      vi.fn().mockResolvedValueOnce(firstLock).mockResolvedValueOnce(secondLock),
    );
    render(<RecipeCookMode {...recipe} />);
    fireEvent.click(screen.getByRole("button", { name: "Cook mode" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    setVisibility("hidden");
    fireEvent(document, new Event("visibilitychange"));
    setVisibility("visible");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    firstLock.emitRelease();
    expect(secondLock.released).toBe(false);
  });

  it("does not start a second wake-lock request while one is pending", async () => {
    let resolveRequest: ((lock: FakeWakeLockSentinel) => void) | undefined;
    const lock = new FakeWakeLockSentinel();
    const request = setWakeLock(
      () =>
        new Promise<FakeWakeLockSentinel>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(<RecipeCookMode {...recipe} />);
    fireEvent.click(screen.getByRole("button", { name: "Cook mode" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    setVisibility("hidden");
    fireEvent(document, new Event("visibilitychange"));
    setVisibility("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(request).toHaveBeenCalledTimes(1);

    resolveRequest?.(lock);
    await waitFor(() => expect(lock.released).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    await waitFor(() => expect(lock.released).toBe(true));
  });

  it("releases a pending wake lock that resolves after exit", async () => {
    let resolveRequest: ((lock: FakeWakeLockSentinel) => void) | undefined;
    const lock = new FakeWakeLockSentinel();
    setWakeLock(
      () =>
        new Promise<FakeWakeLockSentinel>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(<RecipeCookMode {...recipe} />);
    fireEvent.click(screen.getByRole("button", { name: "Cook mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));

    resolveRequest?.(lock);

    await waitFor(() => expect(lock.released).toBe(true));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reacquires after a pending wake lock resolves while hidden", async () => {
    let resolveFirstRequest: ((lock: FakeWakeLockSentinel) => void) | undefined;
    const firstLock = new FakeWakeLockSentinel();
    const secondLock = new FakeWakeLockSentinel();
    let requestCount = 0;
    const request = setWakeLock(() => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Promise<FakeWakeLockSentinel>((resolve) => {
          resolveFirstRequest = resolve;
        });
      }
      return Promise.resolve(secondLock);
    });
    render(<RecipeCookMode {...recipe} />);
    fireEvent.click(screen.getByRole("button", { name: "Cook mode" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    setVisibility("hidden");
    fireEvent(document, new Event("visibilitychange"));
    resolveFirstRequest?.(firstLock);
    await waitFor(() => expect(firstLock.released).toBe(true));

    setVisibility("visible");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(secondLock.released).toBe(false);
  });

  it("keeps a reopened session active when the previous request resolves", async () => {
    let resolveFirstRequest: ((lock: FakeWakeLockSentinel) => void) | undefined;
    const firstLock = new FakeWakeLockSentinel();
    const secondLock = new FakeWakeLockSentinel();
    let requestCount = 0;
    const request = setWakeLock(() => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Promise<FakeWakeLockSentinel>((resolve) => {
          resolveFirstRequest = resolve;
        });
      }
      return Promise.resolve(secondLock);
    });
    render(<RecipeCookMode {...recipe} />);
    const trigger = screen.getByRole("button", { name: "Cook mode" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));
    fireEvent.click(trigger);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    resolveFirstRequest?.(firstLock);

    await waitFor(() => expect(firstLock.released).toBe(true));
    expect(secondLock.released).toBe(false);
  });
});
