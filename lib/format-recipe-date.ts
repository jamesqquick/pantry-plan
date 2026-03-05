/**
 * Format recipe updated/created date for list cards.
 * Prefer relative time for recent, otherwise "MMM d".
 */

export function formatRecipeDate(updatedAt: Date | null, createdAt: Date | null): string {
  const date = updatedAt ?? createdAt;
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Updated today";
  if (diffDays === 1) return "Updated yesterday";
  if (diffDays > 1 && diffDays <= 7) return `Updated ${diffDays} days ago`;
  if (diffDays > 7 && diffDays <= 30) return `Updated ${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? "" : "s"} ago`;

  const label = updatedAt ? "Updated" : "Created";
  const formatted = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${label} ${formatted}`;
}
