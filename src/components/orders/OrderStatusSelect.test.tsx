// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { actions } from "astro:actions";
import { OrderStatusSelect } from "./OrderStatusSelect";

vi.mock("astro:actions", () => ({
  actions: {
    orders: {
      updateStatus: vi.fn(),
    },
  },
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("OrderStatusSelect", () => {
  it("saves a status change and reports the saved status", async () => {
    vi.mocked(actions.orders.updateStatus).mockResolvedValue({
      data: { id: "order-123", status: "READY" },
      error: undefined,
    });
    const user = userEvent.setup();
    render(<OrderStatusSelect orderId="order-123" initialStatus="CONFIRMED" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Order status" }), "READY");

    await waitFor(() => expect(actions.orders.updateStatus).toHaveBeenCalledWith({
      id: "order-123",
      status: "READY",
    }));
    expect(await screen.findByText("Status set to Ready.")).toBeTruthy();
  });

  it("keeps the saved status and shows an error when the update fails", async () => {
    vi.mocked(actions.orders.updateStatus).mockResolvedValue({
      data: undefined,
      error: { message: "Order not found." },
    } as never);
    const user = userEvent.setup();
    render(<OrderStatusSelect orderId="missing-order" initialStatus="DRAFT" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Order status" }), "CANCELLED");

    expect(await screen.findByText("Order not found.")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Order status" })).toHaveProperty("value", "DRAFT");
    expect(screen.getByRole("alert").textContent).toBe("Order not found.");
  });

  it("restores the saved status and enables a retry when the request throws", async () => {
    vi.mocked(actions.orders.updateStatus).mockRejectedValueOnce(new TypeError("Network offline"))
      .mockResolvedValueOnce({ data: { id: "order-123", status: "READY" }, error: undefined });
    const user = userEvent.setup();
    render(<OrderStatusSelect orderId="order-123" initialStatus="CONFIRMED" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Order status" }), "READY");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Couldn't update the order status. Check your connection and try again.");
    expect(screen.getByRole("combobox", { name: "Order status" })).toHaveProperty("value", "CONFIRMED");

    await user.selectOptions(screen.getByRole("combobox", { name: "Order status" }), "READY");
    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Status set to Ready.");
    expect(screen.getByRole("combobox", { name: "Order status" })).toHaveProperty("value", "READY");
  });
});
