import { useState, useEffect } from "react";
import { actions } from "astro:actions";
import { Input } from "@/components/ui/Input";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Auto-dismiss success toast
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(false), 3000);
    return () => clearTimeout(t);
  }, [success]);

  // Auto-dismiss error toast
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Client-side validation
    if (!currentPassword) {
      setError("Current password is required");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("New password and confirmation do not match");
      return;
    }

    setPending(true);

    const { error: err } = await actions.profile.changePassword({
      currentPassword,
      newPassword,
      confirmNewPassword,
    });

    if (err) {
      setError(err.message || "Failed to change password");
      setPending(false);
      return;
    }

    // Clear the form on success
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setSuccess(true);
    setPending(false);
  }

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    confirmNewPassword.length > 0;

  return (
    <section className="rounded-lg border border-border bg-card p-6 space-y-4">
      <h2 className="text-lg font-semibold text-primary-on-background">
        Change password
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="current-password"
            className="text-sm font-medium text-foreground"
          >
            Current password
          </label>
          <Input
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="new-password"
            className="text-sm font-medium text-foreground"
          >
            New password
          </label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          <p className="text-xs text-muted-foreground">
            Must be at least 8 characters.
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="confirm-password"
            className="text-sm font-medium text-foreground"
          >
            Confirm new password
          </label>
          <Input
            id="confirm-password"
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={pending || !canSubmit}
          aria-busy={pending}
          className="btn-primary cursor-pointer"
        >
          {pending ? "Changing password…" : "Change password"}
        </button>
      </form>

      {/* Inline error */}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Success toast */}
      {success && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-green-600/30 bg-green-600 px-4 py-3 text-sm font-medium text-white shadow-lg animate-toast-in"
        >
          Password changed successfully
        </div>
      )}
    </section>
  );
}
