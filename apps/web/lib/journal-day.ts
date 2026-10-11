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
