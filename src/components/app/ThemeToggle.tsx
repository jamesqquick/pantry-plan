import { useEffect, useRef, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  getResolvedTheme,
  getStoredTheme,
  setTheme,
  subscribeToSystemTheme,
  subscribeToThemeChange,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

const HOVER_OPEN_DELAY_MS = 150;
const HOVER_CLOSE_DELAY_MS = 150;

const TRIGGER_CLASS =
  "flex cursor-pointer items-center justify-center rounded-input p-1.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background";

interface ThemeToggleProps {
  /** Optional extra classes for the wrapper (e.g. positioning on auth pages). */
  className?: string;
}

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle({ className }: ThemeToggleProps) {
  // Start with neutral defaults to keep SSR/CSR markup identical.
  // Real values are read in useEffect after mount.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const hoverOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial read + sync on mount.
  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    setResolved(getResolvedTheme(stored));
    setMounted(true);
  }, []);

  // Stay in sync if another ThemeToggle (or any caller) changes the theme.
  useEffect(() => {
    return subscribeToThemeChange((next) => {
      setThemeState(next);
      setResolved(getResolvedTheme(next));
    });
  }, []);

  // Live OS theme updates while the user is on "system".
  useEffect(() => {
    return subscribeToSystemTheme(() => {
      const stored = getStoredTheme();
      if (stored !== "system") return;
      applyTheme();
      setResolved(getResolvedTheme(stored));
    });
  }, []);

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

  function handleSelect(next: Theme) {
    setTheme(next);
    setOpen(false);
  }

  // Show the icon for the current resolved theme so the trigger reflects
  // what the user actually sees. Until mounted, render a stable placeholder
  // (Monitor) to avoid hydration mismatches.
  const TriggerIcon = !mounted
    ? Monitor
    : resolved === "dark"
      ? Moon
      : Sun;

  const ariaLabel = !mounted
    ? "Toggle theme"
    : `Theme: ${theme === "system" ? `system (${resolved})` : theme}. Click to change.`;

  return (
    <div
      className={cn("relative", className)}
      ref={wrapperRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={TRIGGER_CLASS}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={ariaLabel}
      >
        <TriggerIcon className="size-6" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-40 rounded-input border border-border bg-popover py-1 text-popover-foreground shadow-lg"
          role="menu"
        >
          {OPTIONS.map(({ value, label, Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => handleSelect(value)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150 ease-out",
                  active
                    ? "font-semibold text-primary-on-card"
                    : "text-muted-foreground hover:font-bold hover:text-primary-on-card"
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
