import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  getResolvedTheme,
  getStoredTheme,
  setTheme,
  subscribeToSystemTheme,
  subscribeToThemeChange,
  type ResolvedTheme,
} from "@/lib/theme";

interface ThemeToggleProps {
  /** Optional extra classes for the wrapper (e.g. positioning on auth pages). */
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  // Start with neutral defaults to keep SSR/CSR markup identical.
  // Real values are read in useEffect after mount.
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [mounted, setMounted] = useState(false);

  // Initial read + sync on mount.
  useEffect(() => {
    setResolved(getResolvedTheme(getStoredTheme()));
    setMounted(true);
  }, []);

  // Stay in sync if another ThemeToggle (or any caller) changes the theme.
  useEffect(() => {
    return subscribeToThemeChange((next) => {
      setResolved(getResolvedTheme(next));
    });
  }, []);

  // If the user is still on "system" (no explicit choice yet) and the OS
  // theme flips, reflect it here too.
  useEffect(() => {
    return subscribeToSystemTheme(() => {
      if (getStoredTheme() === "system") {
        applyTheme();
        setResolved(getResolvedTheme("system"));
      }
    });
  }, []);

  function handleToggle() {
    const next: ResolvedTheme = resolved === "dark" ? "light" : "dark";
    setTheme(next);
    setResolved(next);
  }

  const isDark = mounted && resolved === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={
        !mounted
          ? "Toggle theme"
          : `Switch to ${isDark ? "light" : "dark"} mode`
      }
      onClick={handleToggle}
      className={cn(
        "relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border bg-muted/60 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors duration-200 ease-out hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      {/* Sun: visible in light mode, rotates + fades out when switching to dark. */}
      <Sun
        className={cn(
          "absolute size-[18px] transition-all duration-300 ease-out",
          isDark
            ? "scale-50 rotate-90 opacity-0"
            : "scale-100 rotate-0 opacity-100"
        )}
        aria-hidden="true"
      />
      {/* Moon: visible in dark mode, rotates + fades in. */}
      <Moon
        className={cn(
          "absolute size-[18px] transition-all duration-300 ease-out",
          isDark
            ? "scale-100 rotate-0 opacity-100"
            : "scale-50 -rotate-90 opacity-0"
        )}
        aria-hidden="true"
      />
    </button>
  );
}
