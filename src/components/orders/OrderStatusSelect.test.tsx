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
    expect(screen.getByRole("combobox", { name: "Order status" })).toHaveProperty("value", "READY");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Status set to Ready.")).toBeNull();
  });

  it("restores the previous status when the update returns an error", async () => {
    vi.mocked(actions.orders.updateStatus).mockResolvedValue({
      data: undefined,
      error: { message: "Order not found." },
    } as never);
    const user = userEvent.setup();
    render(<OrderStatusSelect orderId="missing-order" initialStatus="DRAFT" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Order status" }), "CANCELLED");

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Order status" })).toHaveProperty("value", "DRAFT"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Order not found.")).toBeNull();
  });

  it("restores the previous status and enables a retry when the request throws", async () => {
    vi.mocked(actions.orders.updateStatus).mockRejectedValueOnce(new TypeError("Network offline"))
      .mockResolvedValueOnce({ data: { id: "order-123", status: "READY" }, error: undefined });
    const user = userEvent.setup();
    render(<OrderStatusSelect orderId="order-123" initialStatus="CONFIRMED" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Order status" }), "READY");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Order status" })).toHaveProperty("value", "CONFIRMED"));
    expect(screen.queryByRole("alert")).toBeNull();

    await user.selectOptions(screen.getByRole("combobox", { name: "Order status" }), "READY");
    await waitFor(() => expect(actions.orders.updateStatus).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("combobox", { name: "Order status" })).toHaveProperty("value", "READY");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
