"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { User } from "lucide-react";
import { signOutAction } from "@/app/actions/auth.actions";

const HOVER_OPEN_DELAY_MS = 150;
const HOVER_CLOSE_DELAY_MS = 150;

interface UserMenuProps {
  email: string;
}

export function UserMenu({ email }: UserMenuProps) {
  const [open, setOpen] = useState(false);
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
    hoverOpenTimeoutRef.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS);
  }

  function handleMouseLeave() {
    if (hoverOpenTimeoutRef.current) {
      clearTimeout(hoverOpenTimeoutRef.current);
      hoverOpenTimeoutRef.current = null;
    }
    hoverCloseTimeoutRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
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
        className="flex cursor-pointer items-center justify-center rounded-input p-1.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
      >
        <User className="size-6" aria-hidden />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-input border border-border bg-popover py-1 shadow-lg text-popover-foreground"
          role="menu"
        >
          <Link
            href="/profile"
            className="block cursor-pointer px-4 py-2 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:font-bold hover:text-primary sm:text-sm"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            View profile
          </Link>
          <form action={signOutAction} className="block">
            <button
              type="submit"
              className="w-full cursor-pointer px-4 py-2 text-left text-xs text-muted-foreground transition-colors duration-150 ease-out hover:font-bold hover:text-primary sm:text-sm"
              role="menuitem"
            >
              Sign out
            </button>
          </form>
          <hr className="my-1 border-border" />
          <p
            className="px-4 py-2 text-xs text-muted-foreground truncate"
            title={email}
            aria-hidden
          >
            {email}
          </p>
        </div>
      )}
    </div>
  );
}
