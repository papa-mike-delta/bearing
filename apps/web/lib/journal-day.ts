// UTC is used only for calendar arithmetic/validation; Today comes from the browser.
export function isJournalDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftJournalDay(day: string, offset: -1 | 1): string | null {
  if (!isJournalDay(day)) return null;
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  const shifted = date.toISOString().slice(0, 10);
  return isJournalDay(shifted) ? shifted : null;
}

// Date.UTC parts plus timeZone UTC: the weekday label cannot shift with the host zone.
export function formatJournalDay(day: string): string {
  if (!isJournalDay(day)) return day;
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date)));
}
