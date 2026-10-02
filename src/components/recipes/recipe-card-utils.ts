export function formatTotalTime(times: {
  totalTimeMinutes: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
}): string | null {
  const { totalTimeMinutes, prepTimeMinutes, cookTimeMinutes } = times;
  if (totalTimeMinutes == null && prepTimeMinutes == null && cookTimeMinutes == null) return null;
  const minutes = totalTimeMinutes ?? (prepTimeMinutes ?? 0) + (cookTimeMinutes ?? 0);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

export function sourceLabel(sourceUrl: string | null): string {
  if (!sourceUrl) return "Your recipe";
  try {
    const url = new URL(sourceUrl);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.hostname.replace(/^www\./, "");
    }
  } catch {
    // Older imported recipes can contain an invalid source URL.
  }
  return "Your recipe";
}

export function monogram(title: string): string {
  const words = title.trim().split(/\s+/).filter((word) => word && !/^(with|and|the|of|a)$/i.test(word));
  if (!words.length) return "?";
  const first = Array.from(words[0])[0].toUpperCase();
  return words.length > 1 ? first + Array.from(words[words.length - 1])[0].toLowerCase() : first;
}

export function toneFor(title: string): "butter" | "tomato" | "olive" {
  const hash = Array.from(title).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
  return (["butter", "tomato", "olive"] as const)[hash % 3];
}

export function topTags<T extends { name: string; n: number }>(tags: readonly T[]): T[] {
  return tags.filter((tag) => tag.n > 0).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
