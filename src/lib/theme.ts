/**
 * Theme management — single source of truth for light/dark mode.
 *
 * Three states:
 *   - "light"  → user explicitly chose light
 *   - "dark"   → user explicitly chose dark
 *   - "system" → follow OS preference (no localStorage entry)
 *
 * NOTE: A minimal copy of `applyTheme`'s logic is duplicated inline in
 * `BaseLayout.astro` so it can run blocking before first paint without
 * waiting for module resolution. Keep that copy in sync if logic changes.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";
const THEME_CHANGE_EVENT = "theme-change";

/** Read the user's stored preference. Returns "system" if unset/invalid. */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage unavailable (private mode, disabled cookies, etc.)
  }
  return "system";
}

/** Resolve a theme preference into the concrete light/dark value to apply. */
export function getResolvedTheme(theme: Theme): ResolvedTheme {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Apply the current theme to <html>. Idempotent — safe to call repeatedly
 * (e.g. on every astro:after-swap).
 */
export function applyTheme(): void {
  if (typeof document === "undefined") return;
  const resolved = getResolvedTheme(getStoredTheme());
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/**
 * Persist the user's preference and apply it. Pass "system" to clear the
 * override and follow OS preference. Notifies listeners via a custom event.
 */
export function setTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    if (theme === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // ignore storage failures; we'll still apply for this session
  }
  applyTheme();
  window.dispatchEvent(
    new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme })
  );
}

/** Subscribe to theme-change events fired by `setTheme`. Returns cleanup. */
export function subscribeToThemeChange(
  cb: (theme: Theme) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<Theme>).detail;
    cb(detail);
  };
  window.addEventListener(THEME_CHANGE_EVENT, handler);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
}

/**
 * Subscribe to OS-level prefers-color-scheme changes. Returns cleanup.
 * Caller is responsible for deciding whether to act on the change
 * (typically only when the stored theme is "system").
 */
export function subscribeToSystemTheme(
  cb: (matchesDark: boolean) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e: MediaQueryListEvent) => cb(e.matches);
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}
