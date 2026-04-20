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

export function AppHeader({ userEmail, pathname }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close mobile menu on escape; lock body scroll when open.
  useEffect(() => {
    if (!menuOpen) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("keydown", onKeydown);
      document.body.style.overflow = previousOverflow;
      hamburgerRef.current?.focus();
    };
  }, [menuOpen]);

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
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={24} aria-hidden="true" />
        </button>
      </div>

      {menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
          className="fixed inset-0 z-50 bg-background mobile-menu-slide-panel"
          data-state="open"
        >
          <div className="flex min-h-14 items-center justify-between px-4 py-4">
            <h2 className="text-lg font-semibold text-foreground">Menu</h2>
            <button
              ref={closeButtonRef}
              type="button"
              className={cn(ICON_BUTTON_CLASS, "h-10 w-10 cursor-pointer")}
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
            >
              <X size={24} aria-hidden="true" />
            </button>
          </div>
          <nav
            className="flex flex-1 flex-col items-center justify-center gap-8 px-4 [&_a]:py-2 [&_a]:text-xl"
            aria-label="Main"
          >
            <div className="flex flex-col items-center gap-6">
              <AppNav
                pathname={pathname}
                onNavigate={() => setMenuOpen(false)}
              />
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
