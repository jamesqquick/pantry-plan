// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ingredientFormValues } from "@/features/ingredients/ingredients.form";
import { OPTIONAL_FIELD_CLEAR_SENTINEL } from "@/features/ingredients/ingredients.schemas";
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

const legacyDensityValues = ingredientFormValues({
  name: "Flour", costBasisUnit: "LB", estimatedCentsPerBasisUnit: 0.4,
  gramsPerCup: 120, gramsPerEach: 50, notes: "Keep airtight.",
});

const numericFields = [
  "Price paid in dollars", "Amount bought", "Volume amount",
  "Weight of the volume shown in grams", "Weight per item in grams",
];
const purchaseGroupMessage = "To estimate cost, enter the price, amount bought, and unit together. Leave all three blank to skip cost details.";
const volumeGroupMessage = "To convert volume to weight, enter the volume amount, unit, and weight in grams together. Leave all three blank to skip this conversion.";

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
  it("requires only the ingredient name and leaves unit selectors at their Unit option", () => {
    render(<IngredientForm mode="create" categories={[]} />);

    expect(Array.from(document.querySelectorAll("[required]"), (element) => element.getAttribute("name"))).toEqual(["name"]);
    expect(screen.getByRole("combobox", { name: "Purchase unit" })).toHaveProperty("value", "");
    expect(screen.getByRole("combobox", { name: "Volume unit" })).toHaveProperty("value", "");
    expect(screen.getAllByRole("option", { name: "Unit" })).toHaveLength(2);
    for (const text of [
      "Add a price and amount bought to estimate recipe and order costs.",
      "Connect counts to weights, such as onions priced by the pound.",
      "Convert cups and spoonfuls to weights when a recipe or shopping unit needs it.",
      "You can add these details later.",
    ]) {
      expect(screen.queryByText(text)).toBeNull();
    }
  });

  it("omits purchase and volume completion guidance for partial details", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="create" categories={[]} />);

    await user.type(screen.getByLabelText("Price paid in dollars"), "4");
    await user.selectOptions(screen.getByRole("combobox", { name: "Purchase unit" }), "CUP");
    expect(screen.queryByText("Add the amount bought to estimate recipe and order costs.")).toBeNull();

    await user.type(screen.getByLabelText("Volume amount"), "1");
    await user.selectOptions(screen.getByRole("combobox", { name: "Volume unit" }), "CUP");
    expect(screen.queryByText("Add a weight for this volume to convert recipe and shopping units.")).toBeNull();
    expect(screen.queryByText(purchaseGroupMessage)).toBeNull();
    expect(screen.queryByText(volumeGroupMessage)).toBeNull();
  });

  it("does not repeat Auto count guidance already available in the tooltip", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="create" categories={[]} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Purchase unit" }), "COUNT");
    expect(screen.queryByText("For this ingredient, Auto uses count.")).toBeNull();
  });

  it("submits a new ingredient with only a name", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="create" categories={[]} />);

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Tortillas");
    await user.click(screen.getByRole("button", { name: "Create ingredient" }));

    await waitFor(() => expect(actionMocks.create).toHaveBeenCalledOnce());
    expect((actionMocks.create.mock.calls[0]![0] as FormData).get("name")).toBe("Tortillas");
  });

  it("requires the purchase amount and unit when a price is entered", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="create" categories={[]} />);

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Oil");
    await user.type(screen.getByLabelText("Price paid in dollars"), "4");
    await user.click(screen.getByRole("button", { name: "Create ingredient" }));

    expect(actionMocks.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Amount bought").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Purchase unit" }).getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Amount bought"));
    const alert = screen.getByRole("alert", { name: "Complete the cost details" });
    expect(screen.getAllByText(purchaseGroupMessage)).toHaveLength(1);
    expect(screen.getByLabelText("Amount bought").getAttribute("aria-describedby")).toBe(alert.id);
    expect(screen.getByRole("combobox", { name: "Purchase unit" }).getAttribute("aria-describedby")).toBe(alert.id);
    expect(screen.getByLabelText("Price paid in dollars").hasAttribute("aria-invalid")).toBe(false);
    expect(screen.queryByText("Enter how much you bought, greater than 0.")).toBeNull();
    expect(screen.queryByText("Choose a purchase unit.")).toBeNull();
    expect(screen.queryByText("Check the highlighted fields before saving.")).toBeNull();
  });

  it("requires all volume details when one is entered", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="create" categories={[]} />);

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Flour");
    await user.type(screen.getByLabelText("Volume amount"), "1");
    await user.selectOptions(screen.getByRole("combobox", { name: "Volume unit" }), "CUP");
    await user.click(screen.getByRole("button", { name: "Create ingredient" }));

    expect(actionMocks.create).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Weight of the volume shown in grams").getAttribute("aria-invalid")).toBe("true");
    const alert = screen.getByRole("alert", { name: "Complete the volume conversion" });
    expect(screen.getAllByText(volumeGroupMessage)).toHaveLength(1);
    expect(screen.getByLabelText("Weight of the volume shown in grams").getAttribute("aria-describedby")).toBe(alert.id);
    expect(screen.getByLabelText("Volume amount").hasAttribute("aria-invalid")).toBe(false);
    expect(screen.getByRole("combobox", { name: "Volume unit" }).hasAttribute("aria-invalid")).toBe(false);
    expect(document.activeElement).toBe(screen.getByLabelText("Weight of the volume shown in grams"));
    expect(screen.queryByText("Enter a number greater than 0.")).toBeNull();
    expect(screen.queryByText("Check the highlighted fields before saving.")).toBeNull();
  });

  it("clears each group message when its details are completed or emptied", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="create" categories={[]} />);

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Oil");
    await user.type(screen.getByLabelText("Price paid in dollars"), "4");
    await user.type(screen.getByLabelText("Volume amount"), "1");
    await user.click(screen.getByRole("button", { name: "Create ingredient" }));

    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getAllByText(purchaseGroupMessage)).toHaveLength(1);
    expect(screen.getAllByText(volumeGroupMessage)).toHaveLength(1);
    expect(screen.queryByText("Check the highlighted fields before saving.")).toBeNull();

    await user.type(screen.getByLabelText("Amount bought"), "12");
    expect(screen.getAllByText(purchaseGroupMessage)).toHaveLength(1);
    await user.selectOptions(screen.getByRole("combobox", { name: "Purchase unit" }), "COUNT");
    expect(screen.queryByText(purchaseGroupMessage)).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByLabelText("Amount bought").hasAttribute("aria-invalid")).toBe(false);
    expect(screen.getByRole("combobox", { name: "Purchase unit" }).hasAttribute("aria-invalid")).toBe(false);

    await user.clear(screen.getByLabelText("Volume amount"));
    expect(screen.queryByText(volumeGroupMessage)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Volume unit" }).hasAttribute("aria-invalid")).toBe(false);
    expect(screen.getByLabelText("Weight of the volume shown in grams").hasAttribute("aria-invalid")).toBe(false);
  });

  it("shows the footer note only while errors beyond incomplete groups remain", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="create" categories={[]} />);

    await user.type(screen.getByLabelText("Price paid in dollars"), "4");
    await user.click(screen.getByRole("button", { name: "Create ingredient" }));

    expect(screen.getByText(purchaseGroupMessage)).toBeTruthy();
    expect(screen.getByText("Enter an ingredient name.")).toBeTruthy();
    expect(screen.getByText("Check the highlighted fields before saving.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));

    await user.type(screen.getByRole("textbox", { name: "Name" }), "Oil");
    expect(screen.getByText(purchaseGroupMessage)).toBeTruthy();
    expect(screen.queryByText("Check the highlighted fields before saving.")).toBeNull();
  });

  it("shows the shared instruction when an incomplete field is blurred", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="create" categories={[]} />);

    await user.type(screen.getByLabelText("Price paid in dollars"), "4");
    expect(screen.queryByText(purchaseGroupMessage)).toBeNull();
    await user.click(screen.getByLabelText("Amount bought"));
    await user.tab();

    expect(screen.getByRole("alert", { name: "Complete the cost details" })).toBeTruthy();
    expect(screen.getByLabelText("Amount bought").getAttribute("aria-invalid")).toBe("true");
    expect(actionMocks.create).not.toHaveBeenCalled();
  });

  it("allows unrelated edits while preserving an untouched legacy partial purchase group", async () => {
    const user = userEvent.setup();
    const legacyValues = ingredientFormValues({ name: "Oil", purchasePriceCents: 400 });
    render(<IngredientForm mode="edit" ingredientId="oil" categories={[]} initialValues={legacyValues} />);

    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Cooking oil");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    const data = actionMocks.update.mock.calls[0]![0] as FormData;
    expect(data.get("name")).toBe("Cooking oil");
    expect(data.has("purchasePrice")).toBe(false);
    expect(data.has("purchaseQuantity")).toBe(false);
    expect(data.has("purchaseUnit")).toBe(false);
  });

  it("allows unrelated edits while preserving an untouched legacy partial volume group", async () => {
    const user = userEvent.setup();
    const legacyValues = ingredientFormValues({ name: "Flour", volumeAmount: 0.25 });
    render(<IngredientForm mode="edit" ingredientId="flour" categories={[]} initialValues={legacyValues} />);

    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Bread flour");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    const data = actionMocks.update.mock.calls[0]![0] as FormData;
    expect(data.get("name")).toBe("Bread flour");
    expect(data.has("volumeAmount")).toBe(false);
    expect(data.has("volumeUnit")).toBe(false);
    expect(data.has("volumeWeightGrams")).toBe(false);
  });

  it.each([
    ["Volume amount", "2", { volumeAmount: "2", volumeUnit: "CUP", volumeWeightGrams: "120" }],
    ["Volume unit", "TBSP", { volumeAmount: "1", volumeUnit: "TBSP", volumeWeightGrams: "120" }],
    ["Weight of the volume shown in grams", "130", { volumeAmount: "1", volumeUnit: "CUP", volumeWeightGrams: "130" }],
  ] as const)("submits a complete legacy volume reference when %s changes", async (label, value, expected) => {
    const user = userEvent.setup();
    render(<IngredientForm mode="edit" ingredientId="flour" categories={[]} initialValues={legacyDensityValues} />);

    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    expect(Object.fromEntries(actionMocks.update.mock.calls[0]![0] as FormData)).toEqual({
      id: "flour", name: "Flour", ...expected,
    });
  });

  it("omits the synthesized legacy volume reference from unrelated edits", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="edit" ingredientId="flour" categories={[]} initialValues={legacyDensityValues} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Bread flour" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    expect(Object.fromEntries(actionMocks.update.mock.calls[0]![0] as FormData)).toEqual({
      id: "flour", name: "Bread flour",
    });
  });

  it("omits a legacy volume reference when its changes are reverted", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="edit" ingredientId="flour" categories={[]} initialValues={legacyDensityValues} />);

    const weight = screen.getByLabelText("Weight of the volume shown in grams");
    fireEvent.change(weight, { target: { value: "130" } });
    fireEvent.change(weight, { target: { value: "120" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    expect(Object.fromEntries(actionMocks.update.mock.calls[0]![0] as FormData)).toEqual({
      id: "flour", name: "Flour",
    });
  });

  it.each([
    ["legacy density", legacyDensityValues],
    ["legacy partial volume group", ingredientFormValues({ name: "Flour", volumeAmount: 0.25 })],
  ] as const)("sends explicit clears for the complete volume group when clearing a %s", async (_, values) => {
    const user = userEvent.setup();
    render(<IngredientForm mode="edit" ingredientId="flour" categories={[]} initialValues={values} />);

    for (const label of ["Volume amount", "Volume unit", "Weight of the volume shown in grams"]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
    }
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    expect(Object.fromEntries(actionMocks.update.mock.calls[0]![0] as FormData)).toEqual({
      id: "flour", name: "Flour",
      volumeAmount: OPTIONAL_FIELD_CLEAR_SENTINEL,
      volumeUnit: OPTIONAL_FIELD_CLEAR_SENTINEL,
      volumeWeightGrams: OPTIONAL_FIELD_CLEAR_SENTINEL,
    });
  });

  it("rejects an incomplete edit to a synthesized legacy volume reference", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="edit" ingredientId="flour" categories={[]} initialValues={legacyDensityValues} />);

    const weight = screen.getByLabelText("Weight of the volume shown in grams");
    fireEvent.change(weight, { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(actionMocks.update).not.toHaveBeenCalled();
    expect(screen.getByRole("alert", { name: "Complete the volume conversion" })).toBeTruthy();
    expect(weight.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(weight);
  });

  it("requires a changed legacy partial group to be completed or cleared", async () => {
    const user = userEvent.setup();
    const legacyValues = ingredientFormValues({ name: "Oil", purchasePriceCents: 400 });
    render(<IngredientForm mode="edit" ingredientId="oil" categories={[]} initialValues={legacyValues} />);

    const price = screen.getByLabelText("Price paid in dollars");
    await user.clear(price);
    await user.type(price, "5");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(actionMocks.update).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Amount bought").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Purchase unit" }).getAttribute("aria-invalid")).toBe("true");
  });

  it("allows clearing a legacy partial group by clearing its populated field", async () => {
    const user = userEvent.setup();
    const legacyValues = ingredientFormValues({ name: "Oil", purchasePriceCents: 400 });
    render(<IngredientForm mode="edit" ingredientId="oil" categories={[]} initialValues={legacyValues} />);

    await user.clear(screen.getByLabelText("Price paid in dollars"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    const data = actionMocks.update.mock.calls[0]![0] as FormData;
    expect(data.get("purchasePrice")).toBe(OPTIONAL_FIELD_CLEAR_SENTINEL);
    expect(data.has("purchaseQuantity")).toBe(false);
    expect(data.has("purchaseUnit")).toBe(false);
  });

  it("does not show a cost example for an unknown price", () => {
    render(<IngredientForm mode="create" categories={[]} />);

    expect(document.querySelector("output")?.hidden).toBe(true);
    expect(screen.queryByText(/would cost/)).toBeNull();
  });

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

  it.each(numericFields.filter((label) => label !== "Price paid in dollars"))("does not save zero for %s", async (label) => {
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

  it.each(["0", "0.001"])("previews zero cost and submits an explicit %s price", async (priceValue) => {
    const user = userEvent.setup();
    editForm();
    const price = screen.getByLabelText("Price paid in dollars");
    await user.clear(price);
    await user.type(price, priceValue);
    expect(screen.getByText("$0.00").closest("output")?.hidden).toBe(false);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    expect((actionMocks.update.mock.calls[0]![0] as FormData).get("purchasePrice")).toBe(priceValue);
  });

  it("requires the entire purchase group to be cleared together", async () => {
    const user = userEvent.setup();
    editForm();
    const price = screen.getByLabelText("Price paid in dollars");
    await user.clear(price);
    expect(document.querySelector("output")?.hidden).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(actionMocks.update).not.toHaveBeenCalled();
    expect(price.getAttribute("aria-invalid")).toBe("true");
  });

  it("sends explicit clears for every field when clearing a purchase group", async () => {
    const user = userEvent.setup();
    editForm();
    await user.clear(screen.getByLabelText("Price paid in dollars"));
    await user.clear(screen.getByLabelText("Amount bought"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Purchase unit" }), "");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    const data = actionMocks.update.mock.calls[0]![0] as FormData;
    expect(data.get("purchasePrice")).toBe(OPTIONAL_FIELD_CLEAR_SENTINEL);
    expect(data.get("purchaseQuantity")).toBe(OPTIONAL_FIELD_CLEAR_SENTINEL);
    expect(data.get("purchaseUnit")).toBe(OPTIONAL_FIELD_CLEAR_SENTINEL);
    expect(data.has("volumeAmount")).toBe(false);
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

  it("validates supplied invalid values, focuses the first error, and keeps Save available", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="create" categories={[]} />);
    const save = screen.getByRole("button", { name: "Create ingredient" });
    const name = screen.getByRole("textbox", { name: "Name" });
    const weight = screen.getByLabelText("Weight of the volume shown in grams");
    expect(save.hasAttribute("disabled")).toBe(false);
    await user.type(name, "Eggs");
    fireEvent.change(weight, { target: { value: "0" } });
    await user.click(save);
    expect(document.activeElement).toBe(weight);
    expect(actionMocks.create).not.toHaveBeenCalled();
    expect(screen.getByText("Check the highlighted fields before saving.")).toBeTruthy();
    expect(screen.getByText("Enter a number greater than 0.").id).toBe(weight.getAttribute("aria-describedby"));
    expect(screen.queryByText(volumeGroupMessage)).toBeNull();
  });

  it("omits untouched optional values from an edit submission", async () => {
    const user = userEvent.setup();
    editForm();
    await user.selectOptions(screen.getByRole("combobox", { name: "Grocery list unit" }), "LB");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    const data = actionMocks.update.mock.calls[0]![0] as FormData;
    expect(Object.fromEntries(data)).toMatchObject({
      id: "coffee", name: "Coffee", preferredDisplayUnit: "LB",
    });
    expect(data.has("purchasePrice")).toBe(false);
    expect(data.has("purchaseQuantity")).toBe(false);
    expect(data.has("purchaseUnit")).toBe(false);
    expect(data.has("volumeAmount")).toBe(false);
    expect(data.has("gramsPerEach")).toBe(false);
    expect(data.has("estimatedCentsPerBasisUnit")).toBe(false);
    expect(data.has("baseIngredientId")).toBe(false);
    expect(screen.getByRole("alert").textContent).toBe("Try again.");
    expect((screen.getByLabelText("Price paid in dollars") as HTMLInputElement).value).toBe("9.99");
  });

  it("allows counted ingredients without an unused volume conversion", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="edit" ingredientId="eggs" categories={[]} initialValues={{
      ...initialValues, name: "Eggs", purchaseUnit: "COUNT",
      volumeAmount: "", volumeUnit: "", volumeWeightGrams: "",
    }} />);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    expect((actionMocks.update.mock.calls[0]![0] as FormData).has("volumeAmount")).toBe(false);
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
    const item = screen.getByLabelText("Weight per item in grams") as HTMLInputElement;
    fireEvent.change(item, { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(item.getAttribute("aria-invalid")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Reset changes" }));
    expect((screen.getByLabelText("Price paid in dollars") as HTMLInputElement).value).toBe("9.99");
    expect(item.value).toBe("");
    expect(item.hasAttribute("aria-invalid")).toBe(false);
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

  it("rejects zero item weight and encodes an explicit clear", async () => {
    const user = userEvent.setup();
    render(<IngredientForm mode="edit" ingredientId="coffee" categories={["Pantry"]} initialValues={{
      ...initialValues, gramsPerEach: "50",
    }} />);
    const item = screen.getByLabelText("Weight per item in grams");
    fireEvent.change(item, { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(item.getAttribute("aria-invalid")).toBe("true");
    expect(actionMocks.update).not.toHaveBeenCalled();
    await user.clear(item);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(actionMocks.update).toHaveBeenCalledOnce());
    expect((actionMocks.update.mock.calls[0]![0] as FormData).get("gramsPerEach")).toBe(OPTIONAL_FIELD_CLEAR_SENTINEL);
  });
});

describe("IngredientForm actions", () => {
  it.each([
    ["create", "Create ingredient"],
    ["edit", "Save changes"],
  ] as const)("keeps %s actions in the mobile dock", async (mode, saveLabel) => {
    const user = userEvent.setup();
    render(
      mode === "create" ? (
        <IngredientForm mode="create" categories={[]} />
      ) : (
        <IngredientForm
          mode="edit"
          ingredientId="ingredient-123"
          categories={[]}
          initialValues={ingredientFormValues({ name: "Flour" })}
        />
      ),
    );

    const actions = screen.getByRole("group", { name: "Form actions" });
    const dock = actions.parentElement;
    expect(dock?.className).toContain("fixed");
    expect(dock?.className).toContain("sm:static");
    expect(actions.className).toContain("flex-row-reverse");
    expect(within(actions).getByRole("button", { name: saveLabel }).className).toContain("min-h-12");
    if (mode === "create") {
      const cancel = within(actions).getByRole("link", { name: "Cancel" });
      expect(cancel.getAttribute("href")).toBe("/ingredients");
      expect(cancel.className).toContain("min-h-12");
    } else {
      const reset = within(actions).getByRole("button", { name: "Reset changes" });
      expect(reset.className).toContain("min-h-12");
      expect(within(actions).queryByRole("link", { name: "Cancel" })).toBeNull();
      const name = screen.getByRole("textbox", { name: "Name" });
      await user.clear(name);
      await user.type(name, "Bread flour");
      await user.click(reset);
      expect(name).toHaveProperty("value", "Flour");
      expect(actionMocks.update).not.toHaveBeenCalled();
    }
  });
});
