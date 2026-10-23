import { isCalendarDay } from "./areas.ts";

// The one next-date rule, shared by a Person's reach-out and a recurring Task.
// Stored as { every, unit, on? }. The phrase is derived; there is no text parser.

export const nextDateUnits = ["days", "weeks", "months"] as const;
export type NextDateUnit = (typeof nextDateUnits)[number];

export const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof weekdays)[number];

export type NextDateRule =
  | { every: number; unit: "days" }
  | { every: number; unit: "weeks"; on?: Weekday }
  | { every: number; unit: "months"; on?: number | "last" };

export const defaultNextDateRule: NextDateRule = { every: 1, unit: "months" };

// The largest interval a rule may use (Paul's decision: 9999).
export const maxNextDateEvery = 9999;

const positiveInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1;

// Returns a clean copy of a valid rule, or null. A weekday only goes with weeks,
// a month-day (1-31) or "last" only with months, and days take no on-day.
// Lists, named months, start or end dates, and any other key are refused.
export function parseNextDateRule(value: unknown): NextDateRule | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "every" && key !== "unit" && key !== "on")) return null;
  const { every, unit, on } = value as Record<string, unknown>;
  if (!positiveInt(every) || every > maxNextDateEvery) return null;
  const hasOn = keys.includes("on");
  if (unit === "days") return hasOn ? null : { every, unit };
  if (unit === "weeks") {
    if (!hasOn) return { every, unit };
    return typeof on === "string" && (weekdays as readonly string[]).includes(on) ? { every, unit, on: on as Weekday } : null;
  }
  if (unit === "months") {
    if (!hasOn) return { every, unit };
    if (on === "last" || (positiveInt(on) && on <= 31)) return { every, unit, on };
    return null;
  }
  return null;
}

function parts(day: string) {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) - 1, date: Number(day.slice(8, 10)) };
}
function iso(utc: Date) {
  return utc.toISOString().slice(0, 10);
}
function daysIn(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
// The given month (0-based, may overflow) on the given day, clamped to its last day.
function clampedDay(year: number, month: number, date: number | "last") {
  const first = new Date(Date.UTC(year, month, 1));
  const last = daysIn(first.getUTCFullYear(), first.getUTCMonth());
  return iso(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), date === "last" ? last : Math.min(date, last))));
}

// The first match strictly after the anchor day (YYYY-MM-DD), or null.
// - days / weeks with no on-day: the anchor plus n days or n weeks.
// - months with no on-day: the anchor's day-of-month n months on, clamped
//   (Jan 31 + 1 month = Feb 28, or 29 in a leap year).
// - weeks on a weekday: the first such weekday strictly after the anchor, plus
//   (n - 1) weeks. An anchor already on that weekday moves a full n weeks.
// - months on a day or "last": the first such day strictly after the anchor
//   (this month or next, clamped), plus (n - 1) months, clamped again.
// Only a real calendar day (year 0000-9999) is returned; anything past 9999-12-31 is null.
export function nextDate(rule: NextDateRule, anchor: string): string | null {
  const day = rawNextDate(rule, anchor);
  return day !== null && isCalendarDay(day) ? day : null;
}

function rawNextDate(rule: NextDateRule, anchor: string): string | null {
  const valid = parseNextDateRule(rule);
  if (!valid || !isCalendarDay(anchor)) return null;
  const { year, month, date } = parts(anchor);
  const n = valid.every;
  if (valid.unit === "days") return iso(new Date(Date.UTC(year, month, date + n)));
  if (valid.unit === "weeks") {
    if (!valid.on) return iso(new Date(Date.UTC(year, month, date + 7 * n)));
    const current = (new Date(Date.UTC(year, month, date)).getUTCDay() + 6) % 7; // Monday = 0
    const ahead = (weekdays.indexOf(valid.on) - current + 7) % 7 || 7;
    return iso(new Date(Date.UTC(year, month, date + ahead + 7 * (n - 1))));
  }
  if (valid.on === undefined) return clampedDay(year, month + n, date);
  const first = clampedDay(year, month, valid.on) > anchor ? month : month + 1;
  return clampedDay(year, first + n - 1, valid.on);
}

const weekdayName = (day: Weekday) => day[0]!.toUpperCase() + day.slice(1);
function ordinal(day: number) {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th"}`;
}

// The derived phrase: "every month", "every Friday", "every 3 weeks on Tuesday".
export function nextDatePhrase(rule: NextDateRule): string {
  const singular = rule.unit.slice(0, -1);
  const base = rule.every === 1 ? `every ${singular}` : `every ${rule.every} ${rule.unit}`;
  if (rule.unit === "weeks" && rule.on) return rule.every === 1 ? `every ${weekdayName(rule.on)}` : `${base} on ${weekdayName(rule.on)}`;
  if (rule.unit === "months" && rule.on !== undefined) return `${base} on the ${rule.on === "last" ? "last day" : ordinal(rule.on)}`;
  return base;
}
