// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { actions } from "astro:actions";
import { MaterialForm } from "./MaterialForm";
import type { Material } from "@/db/schema/materials";

vi.mock("astro:actions", () => ({ actions: { materials: { create: vi.fn(), update: vi.fn() } } }));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const saved: Material = {
  id: "labels", userId: "cook", name: "Labels", category: "Labels & print", usageUnit: "each",
  packageQuantity: 500, packagePriceCents: 625, supplier: "Shop", productUrl: "https://shop.example.com/labels",
  notes: null, createdAt: new Date(), updatedAt: new Date(),
};

describe("MaterialForm", () => {
  it("defaults to Number of items, keeps it through category changes, and exposes all 12 unit options", () => {
    render(<MaterialForm />);
    const unit = screen.getByRole("combobox", { name: "Usage unit" });
    expect(unit).toHaveProperty("value", "each");
    expect(screen.getByRole("option", { name: "Number of items" })).toHaveProperty("selected", true);
    expect(unit.querySelectorAll("option")).toHaveLength(12);
    fireEvent.change(screen.getByRole("combobox", { name: "Category" }), { target: { value: "Wrapping & liners" } });
    expect(unit).toHaveProperty("value", "each");
    expect(screen.queryByText("Rolls, multipacks, and shared supplies")).toBeNull();
  });

  it("previews fractional-cent pricing independently of optional details and the name", () => {
    render(<MaterialForm />);
    fireEvent.change(screen.getByLabelText(/^Total amount in package/), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText(/^Package price/), { target: { value: "6.25" } });
    expect(screen.getByText("$0.0125")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Total amount in package/), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/^Package price/), { target: { value: "10" } });
    expect(screen.getByText("Cost per item")).toBeTruthy();
    expect(screen.getByText("$1.00")).toBeTruthy();
  });

  it("saves a zero-price material with fractional package quantity and a product link", async () => {
    vi.mocked(actions.materials.create).mockResolvedValue({ data: saved, error: undefined });
    const onSaved = vi.fn();
    render(<MaterialForm onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/^Material name/), { target: { value: " Half sheet " } });
    fireEvent.change(screen.getByLabelText(/^Total amount in package/), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText(/^Package price/), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "https://shop.example.com/sheet" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and add to order" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(actions.materials.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "Half sheet", packageQuantity: 0.5, packagePriceCents: 0, usageUnit: "each", productUrl: "https://shop.example.com/sheet",
    }));
  });

  it("retains edits after a network failure and allows retry with a cleared product link", async () => {
    vi.mocked(actions.materials.update).mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({ data: { ...saved, productUrl: null }, error: undefined });
    const onSaved = vi.fn();
    render(<MaterialForm initialMaterial={saved} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save and add to order" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't save the material. Check your connection and try again.");
    expect(screen.getByLabelText(/^Material name/)).toHaveProperty("value", "Labels");
    fireEvent.click(screen.getByRole("button", { name: "Save and add to order" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(actions.materials.update).toHaveBeenLastCalledWith(expect.objectContaining({ id: "labels", productUrl: null }));
  });

  it("rejects zero package amounts and unsafe product links without submitting", async () => {
    render(<MaterialForm initialMaterial={saved} />);
    fireEvent.change(screen.getByLabelText(/^Total amount in package/), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save material" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter an amount greater than zero.");
    fireEvent.change(screen.getByLabelText(/^Total amount in package/), { target: { value: "500" } });
    fireEvent.change(screen.getByLabelText("Product URL"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save material" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("http:// or https://"));
    expect(actions.materials.update).not.toHaveBeenCalled();
  });
});
