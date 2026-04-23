import { useState, useEffect } from "react";
import { actions } from "astro:actions";
import { Input } from "@/components/ui/Input";

interface Props {
  initialName: string;
  email: string;
  role: string;
}

export function ProfileForm({ initialName, email, role }: Props) {
  const [name, setName] = useState(initialName);
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
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(false);

    const { error: err } = await actions.profile.updateName({ name: trimmed });

    if (err) {
      setError(err.message || "Failed to update profile");
      setPending(false);
      return;
    }

    setSuccess(true);
    setPending(false);
  }

  const isDirty = name.trim() !== initialName;

  return (
    <section className="rounded-lg border border-border bg-card p-6 space-y-4">
      <h2 className="text-lg font-semibold text-primary-on-background">
        Profile details
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email — read-only */}
        <div className="space-y-1.5">
          <label
            htmlFor="profile-email"
            className="text-sm font-medium text-foreground"
          >
            Email
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="profile-email"
              type="email"
              value={email}
              readOnly
              disabled
              className="flex-1 opacity-60"
            />
            {role === "ADMIN" && (
              <span className="inline-flex items-center rounded-input px-2 py-0.5 bg-primary-icon-bg text-primary-icon-fg text-xs font-semibold shrink-0">
                ADMIN
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Email cannot be changed.
          </p>
        </div>

        {/* Name — editable */}
        <div className="space-y-1.5">
          <label
            htmlFor="profile-name"
            className="text-sm font-medium text-foreground"
          >
            Display name
          </label>
          <Input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Your display name"
          />
        </div>

        <button
          type="submit"
          disabled={pending || !isDirty}
          aria-busy={pending}
          className="btn-primary cursor-pointer"
        >
          {pending ? "Saving…" : "Save"}
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
          Profile updated
        </div>
      )}
    </section>
  );
}
