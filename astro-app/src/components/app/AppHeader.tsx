import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppNav } from "./AppNav";
import { UserMenu } from "./UserMenu";

const ICON_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-input text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background";

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
    <header className="bg-transparent">
      <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 sm:flex-nowrap sm:gap-0">
        <a
          href="/recipes"
          className="font-display flex shrink-0 items-baseline gap-1 text-2xl sm:text-3xl"
          aria-label="Pantry Plan home"
        >
          <span className="text-header-logo">Pantry</span>
          <span className="text-header-logo">Plan</span>
        </a>

        <nav
          className="hidden flex-wrap items-center gap-2 sm:flex sm:gap-4"
          aria-label="Main"
        >
          <AppNav pathname={pathname} />
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
          aria-expanded={mounted}
          aria-haspopup="dialog"
          onClick={openMenu}
        >
          <Menu size={24} aria-hidden="true" />
        </button>
      </div>

      {mounted && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
          className="fixed inset-0 z-50 bg-background mobile-menu-slide-panel"
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
              className={cn(ICON_BUTTON_CLASS, "h-10 w-10 cursor-pointer")}
              aria-label="Close menu"
              onClick={closeMenu}
            >
              <X size={24} aria-hidden="true" />
            </button>
          </div>
          <nav
            className="flex flex-1 flex-col items-center justify-center gap-8 px-4 [&_a]:py-2 [&_a]:text-xl"
            aria-label="Main"
          >
            <div className="flex flex-col items-center gap-6">
              <AppNav pathname={pathname} onNavigate={closeMenu} />
            </div>
            <div className="mt-4">
              <UserMenu email={userEmail} />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
