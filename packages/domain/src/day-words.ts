import { isCalendarDay } from "./areas.ts";

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
const short = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const shortYear = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const utc = (day: string) => new Date(`${day}T00:00:00Z`);

// A calendar day as people say it, relative to the browser's Today: Today,
// Tomorrow, Yesterday, a weekday within the coming week, else "Wed, Oct 28"
// (with the year when it differs). Anything that is not a real day comes back as is.
export function dayWords(day: string, today: string): string {
  if (!isCalendarDay(day) || !isCalendarDay(today)) return day;
  const diff = Math.round((utc(day).valueOf() - utc(today).valueOf()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return weekday.format(utc(day));
  return (day.slice(0, 4) === today.slice(0, 4) ? short : shortYear).format(utc(day));
}

// A calendar day with no Today to compare against (server render, before the
// browser's Today is known): always "Wed, Oct 28, 2026", never an ISO date.
// It depends only on the day, so server and first client render match.
export function calendarDayWords(day: string): string {
  return isCalendarDay(day) ? shortYear.format(utc(day)) : day;
}
