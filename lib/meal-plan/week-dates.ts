/**
 * Week boundaries and date formatting for meal planning (Sunday = start of week).
 */

/** Parse YYYY-MM-DD to Date at midnight UTC */
export function parseDateString(s: string): Date {
  return new Date(s + "T00:00:00.000Z");
}

/** Format Date to YYYY-MM-DD (UTC date) */
export function toDateString(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Get Sunday of the week containing the given date (UTC) */
export function getWeekStart(d: Date): Date {
  const du = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = du.getUTCDay();
  const diff = 0 - day;
  du.setUTCDate(du.getUTCDate() + diff);
  return du;
}

/** Get week start as YYYY-MM-DD for the week containing the given date */
export function getWeekStartString(d: Date): string {
  return toDateString(getWeekStart(d));
}

/** Return [Sunday, Monday, ..., Saturday] as YYYY-MM-DD for the given week start */
export function getWeekDates(weekStart: string): string[] {
  const start = parseDateString(weekStart);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    out.push(toDateString(d));
  }
  return out;
}

/** Previous Sunday from weekStart */
export function prevWeek(weekStart: string): string {
  const d = parseDateString(weekStart);
  d.setUTCDate(d.getUTCDate() - 7);
  return toDateString(d);
}

/** Next Sunday from weekStart */
export function nextWeek(weekStart: string): string {
  const d = parseDateString(weekStart);
  d.setUTCDate(d.getUTCDate() + 7);
  return toDateString(d);
}

/** Today in YYYY-MM-DD (UTC) */
export function todayString(): string {
  return toDateString(new Date());
}
