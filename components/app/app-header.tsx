"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Lilita_One } from "next/font/google";
import { cn } from "@/lib/cn";
import { AppNav } from "@/components/app/app-nav";
import { UserMenu } from "@/components/app/user-menu";
import { ICON_BUTTON_CLASS } from "@/components/ui/icons";
import {
  Dialog,
  DialogFullscreenContent,
} from "@/components/ui/dialog";

const lilitaOne = Lilita_One({ weight: "400", subsets: ["latin"] });

interface AppHeaderProps {
  userEmail: string;
}

export function AppHeader({ userEmail }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

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
          <span className="text-header-logo">Pantry</span>
          <span className="text-header-logo">Plan</span>
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
          aria-haspopup="dialog"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={24} aria-hidden />
        </button>
      </div>

      <Dialog
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          if (!open) hamburgerRef.current?.focus();
        }}
      >
        <DialogFullscreenContent
          id="mobile-nav-overlay"
          aria-label="Navigation menu"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            hamburgerRef.current?.focus();
          }}
        >
          <div className="flex min-h-14 items-center justify-between px-4 py-4">
            <span className="text-lg font-semibold text-foreground">
              Menu
            </span>
            <button
              type="button"
              className={cn(ICON_BUTTON_CLASS, "h-10 w-10 cursor-pointer")}
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              <X size={24} aria-hidden />
            </button>
          </div>
          <nav
            className="flex flex-1 flex-col items-center justify-center gap-8 px-4 [&_a]:text-xl [&_a]:py-2"
            aria-label="Main"
          >
            <div className="flex flex-col items-center gap-6">
              <AppNav onNavigate={() => setMenuOpen(false)} />
            </div>
            <div className="mt-4">
              <UserMenu email={userEmail} />
            </div>
          </nav>
        </DialogFullscreenContent>
      </Dialog>
    </header>
  );
}
