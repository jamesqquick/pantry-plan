import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/auth-client";

const HOVER_OPEN_DELAY_MS = 150;
const HOVER_CLOSE_DELAY_MS = 150;

interface UserMenuProps {
  email: string;
}

export function UserMenu({ email }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hoverOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearHoverTimeouts() {
    if (hoverOpenTimeoutRef.current) {
      clearTimeout(hoverOpenTimeoutRef.current);
      hoverOpenTimeoutRef.current = null;
    }
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  }

  function handleMouseEnter() {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
    hoverOpenTimeoutRef.current = setTimeout(
      () => setOpen(true),
      HOVER_OPEN_DELAY_MS
    );
  }

  function handleMouseLeave() {
    if (hoverOpenTimeoutRef.current) {
      clearTimeout(hoverOpenTimeoutRef.current);
      hoverOpenTimeoutRef.current = null;
    }
    hoverCloseTimeoutRef.current = setTimeout(
      () => setOpen(false),
      HOVER_CLOSE_DELAY_MS
    );
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      clearHoverTimeouts();
    };
  }, []);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    // Full nav so middleware re-runs against the cleared cookie.
    window.location.href = "/login";
  }

  return (
    <div
      className="relative"
      ref={wrapperRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-eyebrow bg-eyebrow font-ui text-sm font-bold text-background transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
      >
        <span aria-hidden="true">{email.trim().charAt(0).toUpperCase() || "?"}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 min-w-48 overflow-hidden rounded-2xl border-[1.5px] border-outline-strong bg-popover py-1 shadow-pop text-popover-foreground"
          role="menu"
        >
          <a
            href="/profile"
            className="block cursor-pointer px-4 py-2 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:font-bold hover:text-primary-on-card sm:text-sm"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            View profile
          </a>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={pending}
            aria-busy={pending}
            className="w-full cursor-pointer px-4 py-2 text-left text-xs text-muted-foreground transition-colors duration-150 ease-out hover:font-bold hover:text-primary-on-card sm:text-sm disabled:opacity-50"
            role="menuitem"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
          <hr className="my-1 border-border" />
          <p
            className="px-4 py-2 text-xs text-muted-foreground truncate"
            title={email}
            aria-hidden="true"
          >
            {email}
          </p>
        </div>
      )}
    </div>
  );
}
