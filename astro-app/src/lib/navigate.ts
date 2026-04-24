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
