import { useState } from "react";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    await signOut();
    // Full nav so middleware sees the cleared cookie and shows /login
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="cursor-pointer rounded-input bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
