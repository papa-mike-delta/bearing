import { dateInZone, localInstant } from "./dates";
export function localDateTime(at: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function instantFromInput(value: string, timezone: string) {
  const [date, time] = value.split("T");
  if (!date || !time) throw new Error("Choose a date and time");
  const at = localInstant(date, time.slice(0, 5), timezone);
  if (localDateTime(at, timezone) !== value.slice(0, 16))
    throw new Error(
      "That local time does not exist during the clock change. Choose another time.",
    );
  return at.toISOString();
}
export function plannedForDay(
  item: {
    type: string;
    startAt?: string | null;
    endAt?: string | null;
    scheduledAt?: string | null;
    dueAt?: string | null;
    localDate?: string | null;
  },
  day: string,
  timezone: string,
) {
  if (item.type === "event" && item.startAt && item.endAt) {
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const start = +localInstant(day, "00:00", timezone),
      end = +localInstant(next.toISOString().slice(0, 10), "00:00", timezone);
    if (
      Date.parse(item.startAt) < end &&
      Date.parse(item.endAt) >= start &&
      (Date.parse(item.endAt) > start || item.startAt === item.endAt)
    )
      return "Event plan";
  }
  if (item.scheduledAt && dateInZone(item.scheduledAt, timezone) === day)
    return "Scheduled work";
  if (
    item.localDate === day ||
    (item.dueAt && dateInZone(item.dueAt, timezone) === day)
  )
    return "Due";
  return null;
}
/** Only actual task-list lines are interactive; fenced code blocks stay literal. */
export function markdownTasks(content: string) {
  let fenced = false;
  return content.split("\n").flatMap((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return [];
    }
    const match =
      !fenced && line.match(/^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\]\s+(.*)$/);
    return match
      ? [{ index, checked: match[2].toLowerCase() === "x", text: match[3] }]
      : [];
  });
}
export function toggleMarkdownTask(
  content: string,
  index: number,
  checked: boolean,
) {
  const lines = content.split("\n");
  if (!markdownTasks(content).some((task) => task.index === index))
    return content;
  lines[index] = lines[index].replace(/\[([ xX])\]/, checked ? "[x]" : "[ ]");
  return lines.join("\n");
}
