// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ingredientFormValues } from "@/features/ingredients/ingredients.form";
import IngredientForm from "./IngredientForm";

const actionMocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), searchGlobalForBase: vi.fn(), getGlobalBasePrefill: vi.fn() }));
vi.mock("astro:actions", async () => {
  const { isInputError } = await import("../../../node_modules/astro/dist/actions/runtime/client.js");
  return { actions: { ingredients: actionMocks }, isInputError };
});

const initialValues = ingredientFormValues({
  name: "Coffee", purchasePriceCents: 999, purchaseQuantity: 12, purchaseUnit: "OZ",
  volumeAmount: 1, volumeUnit: "TBSP", volumeWeightGrams: 6, gramsPerCup: 96,
  gramsPerEach: null, preferredDisplayUnit: "GRAM",
});

const numericFields = [
  "Price paid in dollars", "Amount bought", "Volume amount",
  "Weight of the volume shown in grams", "Weight per item in grams",
];

function editForm() {
  return render(<IngredientForm mode="edit" ingredientId="coffee" categories={["Pantry"]} initialValues={initialValues} />);
}

beforeEach(() => {
  vi.resetAllMocks();
  actionMocks.update.mockResolvedValue({ error: { message: "Try again." } });
  actionMocks.create.mockResolvedValue({ error: { message: "Try again." } });
});
afterEach(cleanup);

describe("IngredientForm", () => {
  it.each(numericFields)("rejects typed letters and signs in %s while allowing decimals", async (label) => {
    const user = userEvent.setup();
    editForm();
    const input = screen.getByLabelText(label);
    await user.clear(input);
    await user.type(input, "0.25");
    expect(input).toHaveProperty("value", "0.25");
    await user.type(input, "abcEe+-");
    expect(input).toHaveProperty("value", "0.25");
    await user.type(input, "5");
    expect(input).toHaveProperty("value", "0.255");
    await user.clear(input);
    await user.type(input, ".5");
    expect(input).toHaveProperty("value", ".5");
  });

  it.each(numericFields)("rejects non-decimal paste in %s without changing its value", async (label) => {
    const user = userEvent.setup();
    editForm();
    const input = screen.getByLabelText(label);
    for (const value of ["12abc", "1e3", "1E3", "-2", "+2", "Infinity", "1.2.3", "9".repeat(400)]) {
      await user.clear(input);
      await user.paste(value);
      expect(input).toHaveProperty("value", "");
    }
    await user.paste("0.25");
    expect(input).toHaveProperty("value", "0.25");
    await user.paste("invalid");
    expect(input).toHaveProperty("value", "0.25");
  });

  it.each(numericFields)("does not save zero for %s", async (label) => {
    const user = userEvent.setup();
    editForm();
    const input = screen.getByLabelText(label);
    await user.clear(input);
    await user.type(input, "0");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
    expect(actionMocks.update).not.toHaveBeenCalled();
    expect(screen.queryByText("Enter a weight greater than 0 g for the volume shown.")).toBeNull();
  });

  it("copies a global ingredient from the visible search and submits its populated fields", async () => {
    const user = userEvent.setup();
    actionMocks.searchGlobalForBase.mockResolvedValue({ data: [{ id: "global-flour", name: "All-purpose flour", source: "global" }] });
    actionMocks.getGlobalBasePrefill.mockResolvedValue({ data: {
      category: "Baking", defaultUnit: null, costBasisUnit: "G", estimatedCentsPerBasisUnit: 799 / 2000,
      purchasePriceCents: 799, purchaseQuantity: 2000, purchaseUnit: "G",
      volumeAmount: 0.25, volumeUnit: "CUP", volumeWeightGrams: 30, gramsPerCup: 120,
      gramsPerEach: null, preferredDisplayUnit: "LB", notes: "Keep airtight.",
    } });
    render(<IngredientForm mode="create" categories={["Baking"]} />);
    const search = screen.getByRole("searchbox", { name: "Search the global catalog" });
    await user.type(screen.getByRole("textbox", { name: "Name" }), "My draft ingredient");
    await user.type(search, "flour");
    await user.click(await screen.findByRole("button", { name: "All-purpose flour" }));

    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("All-purpose flour copy");
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveProperty("value", "Baking");
    expect((screen.getByLabelText("Price paid in dollars") as HTMLInputElement).value).toBe("7.99");
    expect((screen.getByLabelText("Amount bought") as HTMLInputElement).value).toBe("2000");
    expect((screen.getByLabelText("Volume amount") as HTMLInputElement).value).toBe("0.25");
    expect((screen.getByLabelText("Weight of the volume shown in grams") as HTMLInputElement).value).toBe("30");
    expect(screen.getByRole("combobox", { name: "Grocery list unit" })).toHaveProperty("value", "LB");
    expect((screen.getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement).value).toBe("Keep airtight.");
    await user.click(screen.getByRole("button", { name: "Create ingredient" }));
    await waitFor(() => expect(actionMocks.create).toHaveBeenCalledOnce());
    expect(Object.fromEntries(actionMocks.create.mock.calls[0]![0] as FormData)).toMatchObject({
      name: "All-purpose flour copy", baseIngredientId: "global-flour", category: "Baking",
      purchasePrice: "7.99", purchaseQuantity: "2000", purchaseUnit: "G",
      volumeAmount: "0.25", volumeUnit: "CUP", volumeWeightGrams: "30", gramsPerEach: "",
      preferredDisplayUnit: "LB", notes: "Keep airtight.",
    });
  });

  it("validates on blur and submission, focuses the first error, and keeps Save available", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="create" categories={[]} />);
    const save = screen.getByRole("button", { name: "Create ingredient" });
    const price = screen.getByLabelText("Price paid in dollars");
    expect(save.hasAttribute("disabled")).toBe(false);
    expect(price.hasAttribute("aria-invalid")).toBe(false);
    await user.click(price);
    await user.tab();
    expect(price.getAttribute("aria-invalid")).toBe("true");
    await user.click(save);
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
    expect(actionMocks.create).not.toHaveBeenCalled();
    expect(screen.getByText("Check the highlighted fields before saving.")).toBeTruthy();
  });

  it("submits raw purchase/serving data and a blank optional item weight", async () => {
    const user = userEvent.setup();
    editForm();
    await user.selectOptions(screen.getByRole("combobox", { name: "Grocery list unit" }), "LB");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    const data = actionMocks.update.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries(data)).toMatchObject({
      id: "coffee", purchasePrice: "9.99", purchaseQuantity: "12", purchaseUnit: "OZ",
      volumeAmount: "1", volumeUnit: "TBSP", volumeWeightGrams: "6", gramsPerEach: "",
      preferredDisplayUnit: "LB",
    });
    expect(data.has("estimatedCentsPerBasisUnit")).toBe(false);
    expect(data.has("baseIngredientId")).toBe(false);
    expect(screen.getByRole("alert").textContent).toBe("Try again.");
    expect((screen.getByLabelText("Price paid in dollars") as HTMLInputElement).value).toBe("9.99");
  });

  it("requires a volume weight even when purchase and recipes could use count", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="edit" ingredientId="eggs" categories={[]} initialValues={{
      ...initialValues, name: "Eggs", purchaseUnit: "COUNT", volumeWeightGrams: "",
    }} />);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Weight of the volume shown in grams"));
    expect(actionMocks.update).not.toHaveBeenCalled();
  });

  it("updates the recipe-cost example and explains incompatible count display without requiring it", async () => {
    const user = userEvent.setup();
    editForm();
    expect(screen.getByText("$0.18")).toBeTruthy();
    await user.selectOptions(screen.getByRole("combobox", { name: "Grocery list unit" }), "EACH");
    expect(screen.getByText("Add weight per item to show shopping amounts in count. Until then, use ounces.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
  });

  it("restores initial values and clears validation when reset", async () => {
    const user = userEvent.setup();
    editForm();
    const price = screen.getByLabelText("Price paid in dollars") as HTMLInputElement;
    await user.clear(price);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(price.getAttribute("aria-invalid")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Reset changes" }));
    expect(price.value).toBe("9.99");
    expect(price.hasAttribute("aria-invalid")).toBe(false);
    expect(actionMocks.update).not.toHaveBeenCalled();
  });

  it("retains entries and re-enables saving after a failed connection", async () => {
    const user = userEvent.setup();
    actionMocks.update.mockRejectedValue(new TypeError("Network request failed"));
    editForm();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your entries are still here.");
    expect(screen.getByRole("button", { name: "Save changes" }).hasAttribute("disabled")).toBe(false);
    expect((screen.getByLabelText("Amount bought") as HTMLInputElement).value).toBe("12");
  });

  it("rejects zero item weight but accepts clearing it", async () => {
    const user = userEvent.setup();
    editForm();
    const item = screen.getByLabelText("Weight per item in grams");
    fireEvent.change(item, { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(item.getAttribute("aria-invalid")).toBe("true");
    expect(actionMocks.update).not.toHaveBeenCalled();
    await user.clear(item);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
  });
});
