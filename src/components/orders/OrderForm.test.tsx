// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { actions } from "astro:actions";
import OrderForm from "./OrderForm";
import type { RecipeOption } from "./OrderItemsEditor";

vi.mock("astro:actions", () => ({
  actions: {
    orders: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const onionRecipeOptions: RecipeOption[] = ([
  { id: "counted", title: "Counted onions", basisUnit: "COUNT" },
  { id: "weighed", title: "Weighed onions", basisUnit: "G" },
  { id: "volume", title: "Volume onions", basisUnit: "CUP" },
] as const).map(({ basisUnit, ...recipe }) => ({
  ...recipe,
  availability: {
    status: "checked", notices: [],
    quantityGroups: [{ ingredientId: "onion", basisUnit, gramsPerCup: null, gramsPerEach: null, cupsPerEach: null }],
  },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

const editProps = {
  mode: "edit" as const,
  orderId: "order-123",
  recipeOptions: [{
    id: "recipe-123", title: "Chocolate chip cookies", availability: { status: "checked", notices: [] },
  }] satisfies RecipeOption[],
  initialName: "Order",
  initialNotes: "",
  initialTotalCostCents: 2000,
  initialCustomerName: "",
  initialCustomerContact: "",
  initialDueDate: "2026-11-04",
  initialDueTime: "09:00",
  initialFulfillmentMethod: "PICKUP" as const,
  initialDeliveryAddress: "",
  initialStatus: "DRAFT" as const,
  initialItems: [{ recipeId: "recipe-123", batches: 1 }],
};

describe("OrderForm", () => {
  it("defaults new orders to seven days from today at 9:00 AM", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 28, 12, 0));

    render(<OrderForm mode="create" recipeOptions={[]} />);

    expect(screen.getByLabelText<HTMLInputElement>(/Order total/).value).toBe("0");
    expect(screen.getByLabelText("Due date")).toHaveProperty("value", "2026-11-04");
    expect(screen.getByLabelText(/Time/)).toHaveProperty("value", "09:00");
  });

  it("submits the default zero total for a new order", async () => {
    vi.mocked(actions.orders.create).mockResolvedValue({
      data: undefined,
      error: { message: "Preview test stopped before navigation." },
    } as never);
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={editProps.recipeOptions} />);

    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Create order" }));

    await waitFor(() => expect(actions.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalCostCents: 0 }),
    ));
  });

  it("submits customer and fulfillment details with the existing recipe batches", async () => {
    vi.mocked(actions.orders.create).mockResolvedValue({
      data: undefined,
      error: { code: "BAD_REQUEST", message: "Preview test stopped before navigation." },
    } as never);
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[{ id: "recipe-123", title: "Chocolate chip cookies", availability: { status: "checked", notices: [] } }]} />);

    await user.clear(screen.getByRole("textbox", { name: /^Name/ }));
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Sarah's birthday cookies");
    const total = screen.getByLabelText(/Order total/);
    await user.clear(total);
    await user.type(total, "20.50");
    await user.type(screen.getByLabelText("Customer name"), "Sarah Morgan");
    await user.type(screen.getByLabelText("Phone or email"), "sarah@example.com");
    await user.clear(screen.getByLabelText("Due date"));
    await user.type(screen.getByLabelText("Due date"), "2026-10-24");
    await user.clear(screen.getByLabelText(/Time/));
    await user.type(screen.getByLabelText(/Time/), "14:00");
    await user.click(screen.getByRole("radio", { name: /Delivery/ }));
    await user.type(screen.getByLabelText(/Delivery address/), "123 Sample Street");
    await user.type(screen.getByLabelText(/Notes/), "Two gift boxes");

    await user.selectOptions(screen.getByRole("combobox", { name: "Order status" }), "CONFIRMED");
    await user.type(screen.getByPlaceholderText("Search recipes…"), "Chocolate");
    await user.click(screen.getByRole("option", { name: "Chocolate chip cookies" }));
    await user.click(screen.getByRole("button", { name: "Create order" }));

    await waitFor(() => expect(actions.orders.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "Sarah's birthday cookies",
      totalCostCents: 2050,
      customerName: "Sarah Morgan",
      customerContact: "sarah@example.com",
      dueDate: "2026-10-24",
      dueTime: "14:00",
      fulfillmentMethod: "DELIVERY",
      deliveryAddress: "123 Sample Street",
      status: "CONFIRMED",
      notes: "Two gift boxes",
      items: [{ recipeId: "recipe-123", batches: 1 }],
    })));
    expect(await screen.findByText("Preview test stopped before navigation.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss error message" })).toBeNull();
  });

  it("disables the submit button until the create action responds", async () => {
    let finish!: (result: unknown) => void;
    vi.mocked(actions.orders.create).mockImplementationOnce(
      () => new Promise((resolve) => { finish = resolve; }) as never,
    );
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[{ id: "recipe-123", title: "Chocolate chip cookies", availability: { status: "checked", notices: [] } }]} />);

    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Create order" }));

    await waitFor(() => expect(actions.orders.create).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Creating…" })).toHaveProperty("disabled", true);

    await act(async () => finish({
      data: undefined,
      error: { code: "BAD_REQUEST", message: "Preview response." },
    }));

    expect(await screen.findByText("Preview response.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create order" })).toHaveProperty("disabled", false);
  });

  it("explains why an order cannot be submitted without a recipe", async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[]} />);

    await user.click(screen.getByRole("button", { name: "Create order" }));

    expect(screen.getByRole("alert").textContent).toContain("Add at least one recipe.");
    expect(actions.orders.create).not.toHaveBeenCalled();
  });

  it("requires a recipe in each added row instead of silently discarding the row", async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[{ id: "recipe-123", title: "Chocolate chip cookies", availability: { status: "checked", notices: [] } }]} />);

    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Add recipe" }));
    await user.click(screen.getByRole("button", { name: "Create order" }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Select a recipe in each row, or remove the empty row.");
    expect(document.activeElement).toBe(alert);
    expect(actions.orders.create).not.toHaveBeenCalled();
  });

  it("allows another attempt after the save request throws", async () => {
    vi.mocked(actions.orders.create).mockRejectedValueOnce(new TypeError("Network offline"))
      .mockResolvedValueOnce({ data: undefined, error: { code: "BAD_REQUEST", message: "Preview test stopped before navigation." } } as never);
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[{ id: "recipe-123", title: "Chocolate chip cookies", availability: { status: "checked", notices: [] } }]} />);

    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Create order" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't save the order. Check your connection and try again.");
    await user.click(screen.getByRole("button", { name: "Create order" }));
    expect(await screen.findByText("Preview test stopped before navigation.")).toBeTruthy();
    expect(actions.orders.create).toHaveBeenCalledTimes(2);
  });

  it("shows a safe error toast instead of a raw database error", async () => {
    vi.mocked(actions.orders.create).mockResolvedValue({
      data: undefined,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "D1_ERROR: failed query",
      },
    } as never);
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[{ id: "recipe-123", title: "Chocolate chip cookies", availability: { status: "checked", notices: [] } }]} />);

    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Create order" }));

    await waitFor(() => expect(actions.orders.create).toHaveBeenCalledOnce());
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't save the order. Check your connection and try again.");
    expect(screen.queryByText(/D1_ERROR/)).toBeNull();
  });

  it("selects recipes by keyboard and keeps the remaining recipe when a row is removed", async () => {
    vi.mocked(actions.orders.create).mockResolvedValue({
      data: undefined,
      error: { code: "BAD_REQUEST", message: "Preview test stopped before navigation." },
    } as never);
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[
      { id: "chocolate", title: "Chocolate chip cookies", availability: { status: "checked", notices: [] } },
      { id: "oatmeal", title: "Oatmeal cookies", availability: { status: "checked", notices: [] } },
    ]} />);

    const firstRecipe = screen.getByRole<HTMLInputElement>("combobox", { name: "Recipe 1" });
    await user.click(firstRecipe);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(firstRecipe.value).toBe("Chocolate chip cookies");

    await user.click(screen.getByRole("button", { name: "Add recipe" }));
    const secondRecipe = screen.getByRole<HTMLInputElement>("combobox", { name: "Recipe 2" });
    await user.click(secondRecipe);
    expect(screen.queryByRole("option", { name: "Chocolate chip cookies" })).toBeNull();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(secondRecipe.value).toBe("Oatmeal cookies");

    await user.click(screen.getByRole("button", { name: "Remove recipe 1" }));
    expect(screen.getByRole<HTMLInputElement>("combobox", { name: "Recipe 1" }).value).toBe("Oatmeal cookies");
    await user.click(screen.getByRole("button", { name: "Create order" }));
    await waitFor(() => expect(actions.orders.create).toHaveBeenCalledWith(expect.objectContaining({
      items: [{ recipeId: "oatmeal", batches: 1 }],
    })));
  });

  it("shows selected-recipe notices without adding availability data to the order payload", async () => {
    vi.mocked(actions.orders.create).mockResolvedValue({
      data: undefined,
      error: { message: "Preview test stopped before navigation." },
    } as never);
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[{
      id: "bread",
      title: "Bread",
      availability: {
        status: "checked",
        notices: [{ code: "missing-price", message: "Flour has no saved price.", href: "/ingredients/flour" }],
      },
    }]} />);

    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.click(screen.getByRole("option", { name: "Bread" }));

    expect(screen.getByRole("link", { name: /Flour has no saved price/ }).getAttribute("href")).toBe("/ingredients/flour");
    await user.click(screen.getByRole("button", { name: "Create order" }));
    await waitFor(() => expect(actions.orders.create).toHaveBeenCalledWith(expect.objectContaining({
      totalCostCents: 0,
      items: [{ recipeId: "bread", batches: 1 }],
    })));
    const payload = vi.mocked(actions.orders.create).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("availability");
  });

  it("uses the initial edit selection and removes stale notices when its recipe changes", async () => {
    const user = userEvent.setup();
    render(<OrderForm
      mode="edit"
      orderId="order-1"
      initialName="Friday"
      initialNotes=""
      initialTotalCostCents={0}
      initialCustomerName=""
      initialCustomerContact=""
      initialDueDate=""
      initialDueTime=""
      initialFulfillmentMethod="PICKUP"
      initialDeliveryAddress=""
      initialStatus="DRAFT"
      initialItems={[{ recipeId: "bread", batches: 1 }]}
      recipeOptions={[
        {
          id: "bread",
          title: "Bread",
          availability: {
            status: "checked",
            notices: [{ code: "missing-conversion", message: "Bread needs a volume conversion.", href: "/ingredients/flour" }],
          },
        },
        { id: "soup", title: "Soup", availability: { status: "checked", notices: [] } },
      ]}
    />);

    expect(screen.getByRole("link", { name: /Bread needs a volume conversion/ })).toBeTruthy();
    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.click(screen.getByRole("option", { name: "Soup" }));
    expect(screen.queryByRole("link", { name: /Bread needs a volume conversion/ })).toBeNull();
  });

  it("updates combination warnings using only the selected recipes", async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={onionRecipeOptions} />);

    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.click(screen.getByRole("option", { name: "Weighed onions" }));
    expect(screen.queryByRole("heading", { name: "Ingredient availability" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add recipe" }));
    await user.click(screen.getByRole("combobox", { name: "Recipe 2" }));
    await user.click(screen.getByRole("option", { name: "Counted onions" }));

    const countWarning = screen.getByRole("link", { name: /weight per item to combine count and mass/ });
    expect(countWarning.getAttribute("href")).toBe("/ingredients/onion");
    expect(countWarning.closest("li")?.textContent).toContain("Weighed onions, Counted onions");
    expect(screen.queryByRole("link", { name: /combine mass and volume/ })).toBeNull();

    await user.click(screen.getByRole("combobox", { name: "Recipe 2" }));
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("option", { name: "Volume onions" }));

    expect(screen.queryByRole("link", { name: /combine count and mass/ })).toBeNull();
    const volumeWarning = screen.getByRole("link", { name: /volume-to-weight reference to combine mass and volume/ });
    expect(volumeWarning.closest("li")?.textContent).toContain("Weighed onions, Volume onions");
    expect(volumeWarning.closest("li")?.textContent).not.toContain("Counted onions");

    await user.click(screen.getByRole("button", { name: "Remove recipe 2" }));
    expect(screen.queryByRole("heading", { name: "Ingredient availability" })).toBeNull();
  });

  it("deduplicates initial edit combination warnings and keeps intrinsic warnings after removing a recipe", async () => {
    const user = userEvent.setup();
    render(<OrderForm
      mode="edit"
      orderId="order-1"
      initialName="Friday"
      initialNotes=""
      initialTotalCostCents={0}
      initialCustomerName=""
      initialCustomerContact=""
      initialDueDate=""
      initialDueTime=""
      initialFulfillmentMethod="PICKUP"
      initialDeliveryAddress=""
      initialStatus="DRAFT"
      initialItems={[{ recipeId: "mixed", batches: 1 }, { recipeId: "weighed", batches: 1 }]}
      recipeOptions={[
        {
          id: "mixed", title: "Mixed onions",
          availability: {
            status: "checked",
            notices: [{ code: "cannot-combine", message: "Add weight per item to combine count and mass quantities; kept separate.", href: "/ingredients/onion" }],
            quantityGroups: [...onionRecipeOptions[0]!.availability.quantityGroups!, ...onionRecipeOptions[1]!.availability.quantityGroups!],
          },
        },
        ...onionRecipeOptions,
      ]}
    />);

    const warning = screen.getByRole("link", { name: /weight per item to combine count and mass/ });
    expect(warning.closest("li")?.textContent).toContain("Mixed onions, Weighed onions");

    await user.click(screen.getByRole("button", { name: "Remove recipe 2" }));

    const remainingWarning = screen.getByRole("link", { name: /weight per item to combine count and mass/ });
    expect(remainingWarning.closest("li")?.textContent).toContain("Mixed onions");
    expect(remainingWarning.closest("li")?.textContent).not.toContain("Weighed onions");
  });

  it("reports an unavailable recipe check without claiming the data is complete", async () => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[{
      id: "recipe-123",
      title: "Soup",
      availability: { status: "unavailable", notices: [] },
    }]} />);

    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.click(screen.getByRole("option", { name: "Soup" }));

    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/could not be checked/i);
    expect(status.textContent).toMatch(/may be incomplete/i);
    expect(status.textContent).not.toMatch(/\bis complete\b/i);
  });

  it.each([
    ["20", 2000],
    ["0", 0],
    ["0.29", 29],
    ["70368744177664.01", 7036874417766401],
  ])("submits a dollar total of %s as integer cents", async (dollars, totalCostCents) => {
    vi.mocked(actions.orders.create).mockResolvedValue({
      data: undefined,
      error: { message: "Preview test stopped before navigation." },
    } as never);
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={editProps.recipeOptions} />);

    fireEvent.change(screen.getByLabelText(/Order total/), { target: { value: dollars } });
    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Create order" }));

    await waitFor(() => expect(actions.orders.create).toHaveBeenCalledWith(expect.objectContaining({ totalCostCents })));
  });

  it.each(["", "-1", "20.001"])("blocks a blank or invalid dollar total of '%s'", async (dollars) => {
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={editProps.recipeOptions} />);
    const total = screen.getByLabelText<HTMLInputElement>(/Order total/);

    await user.clear(total);
    if (dollars) await user.type(total, dollars);
    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Create order" }));

    expect(total.checkValidity()).toBe(false);
    expect(actions.orders.create).not.toHaveBeenCalled();
  });

  it.each([
    ["25.50", 2550],
    ["0", 0],
  ])("prefills the saved total and updates it to $%s", async (dollars, totalCostCents) => {
    vi.mocked(actions.orders.update).mockResolvedValue({
      data: undefined,
      error: { message: "Preview test stopped before navigation." },
    } as never);
    const user = userEvent.setup();
    render(<OrderForm {...editProps} />);
    const total = screen.getByLabelText<HTMLInputElement>(/Order total/);
    expect(total.value).toBe("20");

    await user.clear(total);
    await user.type(total, String(dollars));
    await user.click(screen.getByRole("button", { name: "Save order" }));

    await waitFor(() => expect(actions.orders.update).toHaveBeenCalledWith(expect.objectContaining({
      id: "order-123", totalCostCents,
    })));
  });

  it("defaults a legacy order with no total to zero when editing", async () => {
    vi.mocked(actions.orders.update).mockResolvedValue({
      data: undefined,
      error: { message: "Preview test stopped before navigation." },
    } as never);
    const user = userEvent.setup();
    render(<OrderForm {...editProps} initialTotalCostCents={null} />);
    const total = screen.getByLabelText<HTMLInputElement>(/Order total/);
    expect(total.value).toBe("0");

    await user.click(screen.getByRole("button", { name: "Save order" }));

    await waitFor(() => expect(actions.orders.update).toHaveBeenCalledWith(expect.objectContaining({ totalCostCents: 0 })));
  });

  it("preserves a large saved total when editing without changing it", async () => {
    vi.mocked(actions.orders.update).mockResolvedValue({
      data: undefined,
      error: { message: "Preview test stopped before navigation." },
    } as never);
    const user = userEvent.setup();
    render(<OrderForm {...editProps} initialTotalCostCents={9007199254740990} />);

    expect(screen.getByLabelText<HTMLInputElement>(/Order total/).value).toBe("90071992547409.9");
    await user.click(screen.getByRole("button", { name: "Save order" }));

    await waitFor(() => expect(actions.orders.update).toHaveBeenCalledWith(expect.objectContaining({
      totalCostCents: 9007199254740990,
    })));
  });
});
