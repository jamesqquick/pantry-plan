// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppHeader } from "./AppHeader";

vi.mock("./AppNav", () => ({ AppNav: () => null }));
vi.mock("./ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("./UserMenu", () => ({ UserMenu: () => null }));

afterEach(cleanup);

it("preserves focus on an anchored page when the header mounts", () => {
  render(<>
    <h2 tabIndex={-1} ref={(heading) => { heading?.focus(); }}>Ingredients</h2>
    <AppHeader userEmail="cook@example.test" pathname="/recipes/recipe/edit" />
  </>);

  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Ingredients" }));
});

it("returns focus to the menu trigger after closing the mobile menu", async () => {
  const user = userEvent.setup();
  render(<AppHeader userEmail="cook@example.test" pathname="/recipes" />);
  const trigger = screen.getByRole("button", { name: "Open menu" });

  await user.click(trigger);
  const menu = screen.getByRole("dialog", { name: "Main menu" });
  await waitFor(() => expect(menu.getAttribute("data-state")).toBe("open"));
  await user.click(screen.getByRole("button", { name: "Close menu" }));
  // jsdom lacks AnimationEvent, so React uses the prefixed event.
  fireEvent(menu, new Event("webkitAnimationEnd", { bubbles: true }));

  expect(screen.queryByRole("dialog", { name: "Main menu" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
