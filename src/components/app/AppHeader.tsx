import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppNav } from "./AppNav";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";

const ICON_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border-[1.5px] border-outline-strong bg-background text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-header";

interface AppHeaderProps {
  userEmail: string;
  pathname: string;
}

type PanelPhase =
  | "hidden" // not in DOM
  | "entering" // mounted, about to animate in
  | "open" // fully open / animating in
  | "closing"; // animating out, still in DOM

export function AppHeader({ userEmail, pathname }: AppHeaderProps) {
  const [phase, setPhase] = useState<PanelPhase>("hidden");
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const mounted = phase !== "hidden";
  const open = phase === "open";

  function openMenu() {
    setPhase("entering");
    // Next frame, flip to "open" so the CSS applies [data-state="open"]
    // and runs the slide-in animation from the offscreen base state.
    requestAnimationFrame(() => {
      setPhase((p) => (p === "entering" ? "open" : p));
    });
  }

  function closeMenu() {
    setPhase((p) => (p === "open" ? "closing" : p));
  }

  function handleAnimationEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (phase === "closing") setPhase("hidden");
  }

  // Lock body scroll + Escape-to-close while the panel is visually open.
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Return focus to the hamburger after the panel fully unmounts.
  useEffect(() => {
    if (!mounted && !open) hamburgerRef.current?.focus();
  }, [mounted, open]);

  return (
    <header className="bg-header">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <div className="flex min-h-16 items-center justify-between gap-4 border-b border-header-border sm:min-h-20">
        <a
          href="/recipes"
          className="font-display flex shrink-0 items-baseline gap-[0.25em] text-[1.5rem] leading-none tracking-[-0.04em] sm:text-[1.75rem]"
          aria-label="Quick Pantry home"
        >
          <span className="text-header-logo">Quick</span>
          <span className="text-header-logo">Pantry</span>
        </a>

        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Main"
        >
          <AppNav pathname={pathname} />
          <span className="ml-2 shrink-0">
            <ThemeToggle />
          </span>
          <span className="shrink-0">
            <UserMenu email={userEmail} />
          </span>
        </nav>

        <button
          ref={hamburgerRef}
          type="button"
          className={cn(
            ICON_BUTTON_CLASS,
            "h-11 w-11 shrink-0 cursor-pointer lg:hidden"
          )}
          aria-label="Open menu"
          aria-expanded={mounted}
          aria-haspopup="dialog"
          onClick={openMenu}
        >
          <Menu size={22} aria-hidden="true" />
        </button>
      </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid min-h-16 grid-cols-4 gap-1 border-t border-header-border bg-header/95 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_color-mix(in_oklch,var(--ink)_8%,transparent)] backdrop-blur-md lg:hidden [&_a]:flex [&_a]:min-w-0 [&_a]:min-h-[3.25rem] [&_a]:items-center [&_a]:justify-center [&_a]:whitespace-normal [&_a]:px-1 [&_a]:py-1 [&_a]:text-center [&_a]:leading-tight [&_a]:[overflow-wrap:anywhere]"
        aria-label="Primary"
      >
        <AppNav pathname={pathname} variant="bar" />
      </nav>

      {mounted && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
          className="fixed inset-0 z-50 mobile-menu-slide-panel bg-header/95 pt-[env(safe-area-inset-top)] backdrop-blur-md supports-[backdrop-filter]:bg-header/85"
          data-state={
            phase === "open"
              ? "open"
              : phase === "closing"
                ? "closed"
                : undefined
          }
          onAnimationEnd={handleAnimationEnd}
        >
          <div className="flex min-h-14 items-center justify-end px-4 py-4">
            <button
              ref={closeButtonRef}
              type="button"
              className={cn(ICON_BUTTON_CLASS, "h-11 w-11 cursor-pointer")}
              aria-label="Close menu"
              onClick={closeMenu}
            >
              <X size={22} aria-hidden="true" />
            </button>
          </div>
          <nav
            className="flex flex-1 flex-col items-center justify-center gap-8 px-4 [&_a]:inline-flex [&_a]:min-h-12 [&_a]:items-center [&_a]:py-2 [&_a]:text-xl"
            aria-label="Main"
          >
            <div className="flex flex-col items-center gap-4">
              <AppNav pathname={pathname} variant="overlay" onNavigate={closeMenu} />
            </div>
            <div className="mt-4 flex items-center gap-4">
              <ThemeToggle />
              <UserMenu email={userEmail} />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
