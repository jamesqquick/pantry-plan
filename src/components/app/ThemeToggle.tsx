import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  getResolvedTheme,
  getStoredTheme,
  setTheme,
  subscribeToSystemTheme,
  subscribeToThemeChange,
  type Theme,
} from "@/lib/theme";

interface ThemeToggleProps {
  /** Optional extra classes for the wrapper (e.g. positioning on auth pages). */
  className?: string;
}

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
];

const OPTION_INDEX: Record<Theme, number> = {
  light: 0,
  system: 1,
  dark: 2,
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  // Start with neutral defaults to keep SSR/CSR markup identical.
  // Real values are read in useEffect after mount.
  const [theme, setThemeState] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  // Initial read + sync on mount.
  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    setMounted(true);
  }, []);

  // Stay in sync if another ThemeToggle (or any caller) changes the theme.
  useEffect(() => {
    return subscribeToThemeChange((next) => {
      setThemeState(next);
    });
  }, []);

  // Live OS theme updates while the user is on "system" — keeps the
  // <html> class in sync even though the segmented selection itself
  // doesn't change (still on "system").
  useEffect(() => {
    return subscribeToSystemTheme(() => {
      if (getStoredTheme() === "system") applyTheme();
    });
  }, []);

  function handleSelect(next: Theme) {
    setTheme(next);
  }

  // Until mounted, render with the indicator hidden so the markup is
  // stable across SSR/CSR (no hydration mismatch on a positioned pill).
  const activeIndex = OPTION_INDEX[theme];
  const resolvedLabel =
    theme === "system" ? `system (${getResolvedTheme(theme)})` : theme;

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn(
        "relative inline-flex items-center rounded-full border border-border bg-muted/60 p-1 text-muted-foreground shadow-sm backdrop-blur-sm",
        className
      )}
    >
      {/* Sliding pill indicator. Width is one third of the track, slides
          via translateX. Hidden until mounted to avoid jumping into place. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-background shadow-sm ring-1 ring-border/60 transition-transform duration-300 ease-out",
          mounted ? "opacity-100" : "opacity-0"
        )}
        style={{
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />

      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={
              !mounted
                ? label
                : value === "system"
                  ? `Theme: ${resolvedLabel}. Choose system.`
                  : `Choose ${label.toLowerCase()} theme.`
            }
            onClick={() => handleSelect(value)}
            className={cn(
              "relative z-10 flex h-8 w-9 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active && mounted
                ? "text-foreground"
                : "hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                "size-4 transition-transform duration-300 ease-out",
                active && mounted ? "scale-110" : "scale-100"
              )}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
