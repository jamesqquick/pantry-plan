// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signIn } from "@/lib/auth-client";
import { LoginForm } from "./LoginForm";

vi.mock("@/lib/auth-client", () => ({ signIn: { email: vi.fn() } }));
vi.mock("./GoogleSignInButton", () => ({ GoogleSignInButton: () => null }));
afterEach(cleanup);

describe("LoginForm dependency failures", () => {
  it("shows the server's availability message and settles the pending state", async () => {
    const message = "Quick Pantry is temporarily unavailable. Please try again shortly.";
    vi.mocked(signIn.email).mockResolvedValue({ data: null, error: { code: "SERVICE_UNAVAILABLE", message, status: 503, statusText: "Service Unavailable" } });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "cook@example.test");
    await user.type(screen.getByLabelText("Password"), "test-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", message);
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveProperty("disabled", false);
    expect(signIn.email).toHaveBeenCalledOnce();
  });
});
