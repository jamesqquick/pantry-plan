/**
 * Soft-navigate using Astro's client router when available, falling back
 * to a full page load. React islands can't import `astro:transitions/client`
 * directly, so we use the global `navigation` API that the ClientRouter
 * injects onto the page.
 *
 * Usage: `softNavigate("/meal-plan/2024-01-01")`
 */
export function softNavigate(href: string): void {
  // Astro's ClientRouter patches Navigation API on supported browsers.
  // On unsupported browsers or if the client router isn't loaded, fall back.
  if (typeof window !== "undefined" && "navigation" in window) {
    try {
      (window as any).navigation.navigate(href);
      return;
    } catch {
      // Fall through to hard nav
    }
  }
  window.location.href = href;
}

/**
 * Validate that a redirect target is a same-origin path and not an
 * attacker-controlled URL. Defends against open redirects from query
 * parameters like `?next=//evil.com` or `?next=/\evil.com`.
 *
 * Returns the path if safe; otherwise the supplied fallback (default "/").
 *
 * A safe path:
 *   - starts with "/"
 *   - the second character is NOT "/" or "\" (blocks protocol-relative
 *     and backslash-tricks)
 *   - is not a single "/" alone (no protocol confusion)
 */
export function safeRelativePath(
  path: string | undefined | null,
  fallback = "/",
): string {
  if (typeof path !== "string") return fallback;
  if (!/^\/[^/\\]/.test(path)) return fallback;
  return path;
}
