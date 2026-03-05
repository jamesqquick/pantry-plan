"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Lilita_One } from "next/font/google";
import { cn } from "@/lib/cn";
import { AppNav } from "@/components/app/app-nav";
import { UserMenu } from "@/components/app/user-menu";
import { ICON_BUTTON_CLASS } from "@/components/ui/icons";

const lilitaOne = Lilita_One({ weight: "400", subsets: ["latin"] });

interface AppHeaderProps {
  userEmail: string;
}

export function AppHeader({ userEmail }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const showOverlay = menuOpen || closing;

  useEffect(() => {
    if (!showOverlay) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showOverlay]);

  useEffect(() => {
    if (!menuOpen) return;
    setClosing(false);
    setEntered(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") startClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

  function startClose() {
    setClosing(true);
  }

  function handleOverlayTransitionEnd(e: React.TransitionEvent) {
    if (e.target !== e.currentTarget) return;
    if (closing) {
      setMenuOpen(false);
      setClosing(false);
      setEntered(false);
      hamburgerRef.current?.focus();
    }
  }

  return (
    <header className="bg-transparent">
      <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 sm:flex-nowrap sm:gap-0">
        <Link
          href="/recipes"
          className={cn(
            "flex shrink-0 items-baseline gap-1 text-2xl sm:text-3xl",
            lilitaOne.className
          )}
          aria-label="Pantry Plan home"
        >
          <span className="text-primary">Pantry</span>
          <span className="text-accent [paint-order:stroke_fill] [-webkit-text-stroke:1.5px_hsl(var(--primary))]">
            Plan
          </span>
        </Link>

        <nav
          className="hidden flex-wrap items-center gap-2 sm:flex sm:gap-4"
          aria-label="Main"
        >
          <AppNav />
          <span className="shrink-0">
            <UserMenu email={userEmail} />
          </span>
        </nav>

        <button
          ref={hamburgerRef}
          type="button"
          className={cn(
            ICON_BUTTON_CLASS,
            "h-10 w-10 shrink-0 cursor-pointer sm:hidden"
          )}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-overlay"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={24} aria-hidden />
        </button>
      </div>

      {showOverlay && (
      <div
        id="mobile-nav-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={cn(
          "fixed inset-0 z-50 flex flex-col bg-background transition-transform duration-300 ease-out sm:hidden",
          entered && !closing ? "translate-x-0" : "translate-x-full"
        )}
        onTransitionEnd={handleOverlayTransitionEnd}
      >
        <div className="flex flex-1 flex-col">
          <div className="flex min-h-14 items-center justify-between px-4 py-4">
            <span className="text-lg font-semibold text-foreground">
              Menu
            </span>
            <button
              type="button"
              className={cn(ICON_BUTTON_CLASS, "h-10 w-10 cursor-pointer")}
              aria-label="Close menu"
              onClick={startClose}
            >
              <X size={24} aria-hidden />
            </button>
          </div>
          <nav
            className="flex flex-1 flex-col items-center justify-center gap-8 px-4 [&_a]:text-xl [&_a]:py-2"
            aria-label="Main"
          >
            <div className="flex flex-col items-center gap-6">
              <AppNav onNavigate={startClose} />
            </div>
            <div className="mt-4">
              <UserMenu email={userEmail} />
            </div>
          </nav>
        </div>
      </div>
      )}
    </header>
  );
}
