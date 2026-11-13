// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ParsedRecipeDraft } from "@/actions/parse";
import { parseIngredientLineForImport } from "@/lib/ingredients/parse-line";
import { ImportWizard } from "./ImportWizard";

const { parseFromUrl, parseFromImage, create, searchForPicker } = vi.hoisted(() => ({
  parseFromUrl: vi.fn(),
  parseFromImage: vi.fn(),
  create: vi.fn(),
  searchForPicker: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    parse: { parseFromUrl, parseFromImage },
    recipes: { create },
    ingredients: { searchForPicker },
  },
}));

const parsed: ParsedRecipeDraft = {
  title: "Imported pasta",
  sourceUrl: "https://example.com/pasta",
  imageUrl: "https://example.com/pasta.jpg",
  servings: 4,
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  totalTimeMinutes: 30,
  ingredients: ["1/64 tsp salt", "2 cups flour", "", "Salt to taste"],
  ingredientLines: [
    parseIngredientLineForImport("1/64 tsp salt"),
    { ...parseIngredientLineForImport("2 cups flour"), ingredientId: "flour-id", ingredientName: "Flour" },
    parseIngredientLineForImport(""),
    { ...parseIngredientLineForImport("Salt to taste"), createName: "Salt" },
  ],
  instructions: ["Boil water.", "Cook pasta."],
  notes: "Serve warm.",
};

const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.scrollIntoView = () => {};
});
afterAll(() => {
  HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

beforeEach(() => {
  parseFromUrl.mockResolvedValue({ data: parsed, error: undefined });
  parseFromImage.mockResolvedValue({ data: { ...parsed, sourceUrl: "", imageUrl: undefined }, error: undefined });
  create.mockResolvedValue({ data: undefined, error: { message: "Try again" } });
  searchForPicker.mockResolvedValue({ data: [], error: undefined });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("unified recipe creation", () => {
  it("starts with an editable form and submits manual recipes through recipes.create", async () => {
    const user = userEvent.setup();
    render(<ImportWizard allTags={[]} />);

    expect(screen.getByLabelText("Title")).toHaveProperty("value", "");
    expect(screen.getByRole("button", { name: "Import from URL" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("button", { name: "Import from photo" })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.type(screen.getByLabelText("Title"), "My pasta");
    await user.type(screen.getByLabelText("Quantity"), "2");
    await user.type(screen.getByLabelText("Ingredient name"), "flour");
    await user.type(screen.getByLabelText("Step 1"), "Mix.");
    await user.click(screen.getByRole("combobox", { name: "Unit" }));
    await user.click(await screen.findByRole("option", { name: "cup" }));
    await user.click(screen.getByRole("button", { name: "Create recipe" }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      title: "My pasta",
      instructions: ["Mix."],
      ingredientsStructured: [expect.objectContaining({ displayText: "flour", quantity: 2, unit: "CUP" })],
    }));
  });

  it("keeps edits after a failed URL import and replaces all form fields and mappings after success", async () => {
    const user = userEvent.setup();
    render(<ImportWizard allTags={[]} />);
    await user.type(screen.getByLabelText("Title"), "My draft");
    await user.type(screen.getByLabelText("Step 1"), "My step");
    await user.type(screen.getByRole("combobox", { name: "Search tags" }), "Lunch");
    await user.click(screen.getByRole("option", { name: "Create “Lunch”" }));
    fireEvent.change(screen.getByLabelText(/Source URL/), { target: { value: parsed.sourceUrl } });
    parseFromUrl.mockResolvedValueOnce({ data: undefined, error: { message: "Not a recipe" } });

    await user.click(screen.getByRole("button", { name: "Import from URL" }));
    const dialog = screen.getByRole("dialog", { name: "Import from URL" });
    expect(dialog.className).toContain("h-dvh");
    await user.type(within(dialog).getByRole("textbox", { name: "Recipe URL" }), parsed.sourceUrl);
    await user.click(within(dialog).getByRole("button", { name: "Import URL" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("Not a recipe");
    expect(screen.getByRole("dialog", { name: "Import from URL" })).toBeTruthy();
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "My draft");
    expect(screen.getByLabelText("Step 1")).toHaveProperty("value", "My step");
    expect(screen.getByRole("button", { name: "Remove Lunch from recipe", hidden: true })).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Import URL" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "Imported pasta");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText(/Source URL/)).toHaveProperty("value", parsed.sourceUrl);
    expect(screen.queryByRole("button", { name: "Remove Lunch from recipe" })).toBeNull();
    expect(screen.getByLabelText(/Image URL/)).toHaveProperty("value", parsed.imageUrl);
    expect(screen.getByLabelText("Servings")).toHaveProperty("value", "4");
    expect(screen.getByLabelText(/Notes/)).toHaveProperty("value", "Serve warm.");
    expect(screen.getByLabelText("Step 1")).toHaveProperty("value", "Boil water.");
    expect(screen.getAllByLabelText("Quantity")[0]).toHaveProperty("value", "0.015625");
    expect(screen.getAllByLabelText("Ingredient name")[1]).toHaveProperty("value", "flour");
    expect(screen.getByRole("button", { name: "Flour" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salt, new catalog ingredient" })).toBeTruthy();
    expect(screen.getAllByLabelText("Quantity")[2]).toHaveProperty("value", "");

    await user.click(screen.getByRole("button", { name: "Remove ingredient 3" }));
    await user.click(screen.getByRole("button", { name: "Create recipe" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      ingredientsStructured: [
        expect.objectContaining({ rawText: "1/64 tsp salt", quantity: 1 / 64, unit: "TSP", ingredientId: "" }),
        expect.objectContaining({ rawText: "2 cups flour", quantity: 2, unit: "CUP", ingredientId: "flour-id" }),
      ],
    }));
  });

  it("keeps the import dialog open with a loading state until URL parsing finishes", async () => {
    const user = userEvent.setup();
    let finishImport!: () => void;
    parseFromUrl.mockImplementationOnce(() => new Promise((resolve) => {
      finishImport = () => resolve({ data: parsed, error: undefined });
    }));
    render(<ImportWizard allTags={[]} />);

    await user.click(screen.getByRole("button", { name: "Import from URL" }));
    const dialog = screen.getByRole("dialog", { name: "Import from URL" });
    await user.type(within(dialog).getByRole("textbox", { name: "Recipe URL" }), parsed.sourceUrl);
    await user.click(within(dialog).getByRole("button", { name: "Import URL" }));

    expect(within(dialog).getByRole("button", { name: /Importing/ })).toHaveProperty("disabled", true);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog", { name: "Import from URL" })).toBeTruthy();
    await act(async () => finishImport());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "Imported pasta");
  });

  it("keeps edits on photo failure, validates files, and applies a successful photo import", async () => {
    const user = userEvent.setup();
    render(<ImportWizard allTags={[]} imageUploadEnabled />);
    await user.type(screen.getByLabelText("Title"), "My draft");
    await user.click(screen.getByRole("button", { name: "Import from photo" }));
    const dialog = screen.getByRole("dialog", { name: "Import from photo" });
    const upload = within(dialog).getByLabelText(/Choose a recipe photo/);

    fireEvent.change(upload, { target: { files: [new File(["photo"], "recipe.gif", { type: "image/gif" })] } });
    expect(within(dialog).getByRole("alert").textContent).toContain("JPEG, PNG, or WebP");
    expect(parseFromImage).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "My draft");

    parseFromImage.mockResolvedValueOnce({ data: undefined, error: { message: "Unreadable photo" } });
    fireEvent.change(upload, { target: { files: [new File(["photo"], "recipe.png", { type: "image/png" })] } });
    expect(parseFromImage).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Import photo" }));
    await waitFor(() => expect(within(dialog).getByRole("alert").textContent).toContain("Unreadable photo"));
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "My draft");
    expect(screen.getByRole("dialog", { name: "Import from photo" })).toBeTruthy();

    let finishPhotoImport!: () => void;
    parseFromImage.mockImplementationOnce(() => new Promise((resolve) => {
      finishPhotoImport = () => resolve({ data: { ...parsed, sourceUrl: "", imageUrl: undefined }, error: undefined });
    }));
    await user.click(within(dialog).getByRole("button", { name: "Import photo" }));
    expect(within(dialog).getByRole("button", { name: /Importing/ })).toHaveProperty("disabled", true);
    expect(within(dialog).getByText("Analyzing image with AI… this may take a moment.")).toBeTruthy();
    await act(async () => finishPhotoImport());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("Title")).toHaveProperty("value", "Imported pasta");
    expect(screen.getByLabelText(/Source URL/)).toHaveProperty("value", "");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(parseFromImage).toHaveBeenCalledTimes(2);
    expect(parseFromImage.mock.calls[0][0]).toBeInstanceOf(FormData);
  });
});
