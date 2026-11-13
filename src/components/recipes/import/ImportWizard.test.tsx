// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportWizard } from "./ImportWizard";

const { parseFromUrl } = vi.hoisted(() => ({ parseFromUrl: vi.fn() }));

vi.mock("astro:actions", () => ({ actions: { parse: { parseFromUrl } } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps a staged tag when switching from manual entry to URL import review", async () => {
  const user = userEvent.setup();
  parseFromUrl.mockResolvedValue({ data: {
    title: "Soup", sourceUrl: "https://example.com/soup", imageUrl: "",
    ingredients: ["1 cup water"], instructions: ["Boil."], notes: "",
  }, error: undefined });
  render(<ImportWizard allTags={[]} />);

  await user.click(screen.getByRole("tab", { name: "Manual" }));
  await user.type(screen.getByRole("combobox", { name: "Search tags" }), "Lunch");
  await user.click(screen.getByRole("option", { name: "Create “Lunch”" }));
  await user.click(screen.getByRole("tab", { name: "From URL" }));
  await user.type(screen.getByRole("textbox", { name: "Recipe URL" }), "https://example.com/soup");
  await user.click(screen.getByRole("button", { name: "Import" }));

  expect((await screen.findByRole("button", { name: "Remove Lunch from recipe" })).getAttribute("aria-pressed")).toBe("true");
});
