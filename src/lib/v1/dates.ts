import { recurrenceRule } from "./contracts";
import { z } from "zod";
export type RecurrenceRule = z.infer<typeof recurrenceRule>;

function parts(at: Date, timezone: string) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  return Object.fromEntries(values.map((p) => [p.type, p.value]));
}
export function dateInZone(at: Date | string, timezone: string) {
  const p = parts(new Date(at), timezone);
  return `${p.year}-${p.month}-${p.day}`;
}
function wallTime(at: Date, timezone: string) {
  const p = parts(at, timezone);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
}
/** Ambiguous wall times use the earlier instant; nonexistent times advance to the first valid minute. */
export function localInstant(
  date: string,
  time: string,
  timezone: string,
): Date {
  const wanted = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const at = new Date(wanted + h * 3600_000);
    offsets.add(wallTime(at, timezone) - at.getTime());
  }
  for (let minutes = 0; minutes <= 180; minutes++) {
    const wall = wanted + minutes * 60_000;
    const matches = [...offsets]
      .map((offset) => new Date(wall - offset))
      .filter((at) => wallTime(at, timezone) === wall)
      .sort((a, b) => +a - +b);
    if (matches.length) return matches[0];
  }
  throw new Error("Local time cannot be resolved");
}
export function nextOccurrence(
  rule: RecurrenceRule,
  scheduled: Date,
  completed: Date,
  anchor = scheduled,
) {
  const base = rule.mode === "calendar" ? scheduled : completed;
  const p = parts(base, rule.timezone),
    origin = parts(anchor, rule.timezone);
  const date = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  if (rule.unit === "month") {
    const day = rule.mode === "calendar" ? +origin.day : +p.day;
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + rule.interval);
    const last = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  } else
    date.setUTCDate(
      date.getUTCDate() + rule.interval * (rule.unit === "week" ? 7 : 1),
    );
  return localInstant(
    date.toISOString().slice(0, 10),
    rule.mode === "calendar" ? rule.localTime : `${p.hour}:${p.minute}`,
    rule.timezone,
  );
}
