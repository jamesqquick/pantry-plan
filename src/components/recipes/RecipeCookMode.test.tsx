// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeCookMode } from "./RecipeCookMode";

const recipe = {
  title: "Weeknight Pasta",
  meta: [
    { label: "Cook", value: "20m" },
    { label: "Servings", value: "4" },
  ],
  ingredients: ["2 cups flour", "3 eggs"],
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
  vi.restoreAllMocks();
});

describe("RecipeCookMode", () => {
  it("opens an isolated cooking surface, tracks progress, and resets on exit", async () => {
    const user = userEvent.setup();
    const lock = new FakeWakeLockSentinel();
    setWakeLock(async () => lock);
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
    await screen.findByText("Screen awake");

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
    expect(screen.getAllByText("1 of 2")).toHaveLength(2);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(skipLink.hasAttribute("aria-hidden")).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(lock.released).toBe(true);

    await user.click(trigger);
    expect(screen.getAllByText("0 of 2")).toHaveLength(2);
  });

  it("continues when wake lock is unsupported or denied", async () => {
    render(<RecipeCookMode {...recipe} />);
    fireEvent.click(screen.getByRole("button", { name: "Cook mode" }));
    expect(await screen.findByText("Screen may sleep")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Exit" }));

    setWakeLock(async () => {
      throw new DOMException("Not allowed", "NotAllowedError");
    });
    fireEvent.click(screen.getByRole("button", { name: "Cook mode" }));
    expect(await screen.findByText("Screen may sleep")).toBeTruthy();
  });

  it("releases and reacquires the wake lock across visibility changes", async () => {
    const firstLock = new FakeWakeLockSentinel();
    const secondLock = new FakeWakeLockSentinel();
    const request = setWakeLock(
      vi.fn().mockResolvedValueOnce(firstLock).mockResolvedValueOnce(secondLock),
    );
    render(<RecipeCookMode {...recipe} />);
    fireEvent.click(screen.getByRole("button", { name: "Cook mode" }));
    await screen.findByText("Screen awake");

    setVisibility("hidden");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(firstLock.released).toBe(true));

    setVisibility("visible");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await screen.findByText("Screen awake");

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
    await screen.findByText("Screen awake");

    setVisibility("hidden");
    fireEvent(document, new Event("visibilitychange"));
    setVisibility("visible");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await screen.findByText("Screen awake");

    firstLock.emitRelease();
    expect(screen.getByText("Screen awake")).toBeTruthy();
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
    await screen.findByText("Screen awake");
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
    await screen.findByText("Screen awake");
  });

  it("keeps a reopened session active when the previous request resolves", async () => {
    let resolveFirstRequest: ((lock: FakeWakeLockSentinel) => void) | undefined;
    const firstLock = new FakeWakeLockSentinel();
    const secondLock = new FakeWakeLockSentinel();
    let requestCount = 0;
    setWakeLock(() => {
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
    await screen.findByText("Screen awake");

    resolveFirstRequest?.(firstLock);

    await waitFor(() => expect(firstLock.released).toBe(true));
    expect(screen.getByText("Screen awake")).toBeTruthy();
    expect(secondLock.released).toBe(false);
  });
});
