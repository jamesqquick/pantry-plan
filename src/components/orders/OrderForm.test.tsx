// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { actions } from "astro:actions";
import OrderForm from "./OrderForm";

vi.mock("astro:actions", () => ({
  actions: {
    orders: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("OrderForm", () => {
  it("submits customer and fulfillment details with the existing recipe batches", async () => {
    vi.mocked(actions.orders.create).mockResolvedValue({
      data: undefined,
      error: { message: "Preview test stopped before navigation." },
    } as never);
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[{ id: "recipe-123", title: "Chocolate chip cookies" }]} />);

    await user.clear(screen.getByRole("textbox", { name: /^Name/ }));
    await user.type(screen.getByRole("textbox", { name: /^Name/ }), "Sarah's birthday cookies");
    await user.type(screen.getByLabelText("Customer name"), "Sarah Morgan");
    await user.type(screen.getByLabelText("Phone or email"), "sarah@example.com");
    await user.type(screen.getByLabelText("Due date"), "2026-10-24");
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
    render(<OrderForm mode="create" recipeOptions={[{ id: "recipe-123", title: "Chocolate chip cookies" }]} />);

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
      .mockResolvedValueOnce({ data: undefined, error: { message: "Preview test stopped before navigation." } } as never);
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[{ id: "recipe-123", title: "Chocolate chip cookies" }]} />);

    await user.click(screen.getByRole("combobox", { name: "Recipe 1" }));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Create order" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Couldn't save the order. Check your connection and try again.");
    await user.click(screen.getByRole("button", { name: "Create order" }));
    expect(await screen.findByText("Preview test stopped before navigation.")).toBeTruthy();
    expect(actions.orders.create).toHaveBeenCalledTimes(2);
  });

  it("selects recipes by keyboard and keeps the remaining recipe when a row is removed", async () => {
    vi.mocked(actions.orders.create).mockResolvedValue({
      data: undefined,
      error: { message: "Preview test stopped before navigation." },
    } as never);
    const user = userEvent.setup();
    render(<OrderForm mode="create" recipeOptions={[
      { id: "chocolate", title: "Chocolate chip cookies" },
      { id: "oatmeal", title: "Oatmeal cookies" },
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
});
