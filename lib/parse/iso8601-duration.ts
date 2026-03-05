/**
 * Parse ISO 8601 duration (e.g. PT20M, PT1H30M) into total minutes.
 * Returns undefined if invalid or not present.
 */
export function parseIso8601DurationToMinutes(value: unknown): number | undefined {
  if (value == null || typeof value !== "string" || !value.startsWith("PT")) return undefined;
  const str = value.toUpperCase().replace(/\s/g, "");
  let minutes = 0;
  const hoursMatch = str.match(/(\d+)H/);
  if (hoursMatch) minutes += parseInt(hoursMatch[1], 10) * 60;
  const minsMatch = str.match(/(\d+)M/);
  if (minsMatch) minutes += parseInt(minsMatch[1], 10);
  const secsMatch = str.match(/(\d+)S/);
  if (secsMatch) minutes += Math.round(parseInt(secsMatch[1], 10) / 60);
  return minutes > 0 ? minutes : undefined;
}
