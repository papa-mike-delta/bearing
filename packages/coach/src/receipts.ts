// The one line a tool call shows as in the Coach thread. Takes a stored or
// streamed tool part; null for parts that aren't a Coach tool call.

import { coachMoods } from "./moods.ts";
import { addCalendarDays, isCalendarDay, habitPeriodDay, mondayOf, noteHref, taskHref } from "@repo/domain";
import { closeRefusalPrefix } from "./close-refusal.ts";

type ToolPart = { type: string; state?: string; output?: unknown; errorText?: string };

const receiptId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const pending = (state: string | undefined) =>
  state === "input-streaming" || state === "input-available";

function nameOf(output: unknown): string | undefined {
  if (typeof output !== "object" || output === null) return undefined;
  const name = (output as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

function flag(output: unknown, key: "notFound" | "invalidId" | "refused") {
  if (typeof output !== "object" || output === null) return false;
  return (output as Record<string, unknown>)[key] === true;
}

type Line = { line: string; href?: string };

const utcDay = (day: string) => new Date(`${day}T00:00:00Z`);
const weekdayMonthDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// A habit period in words: "today", "yesterday" or "Sun, Oct 18"; "this week"
// or "the week of Oct 12". The receipt stores only the absolute day (or
// Monday); today is the viewer's current browser Today, passed at render, so
// "today" is only said while it is true. Without it (server render, before
// hydration) the absolute form shows.
export function habitPeriodWords(period: "day" | "week", day: string, today?: unknown): string {
  const known = typeof today === "string" && isCalendarDay(today) ? today : undefined;
  if (period === "week") return known && mondayOf(known) === day ? "this week" : `the week of ${monthDay.format(utcDay(day))}`;
  if (known === day) return "today";
  if (known && addCalendarDays(known, -1) === day) return "yesterday";
  return weekdayMonthDay.format(utcDay(day));
}

function taskReceipt(line: string, output: unknown): Line {
  const id = (output as { id?: unknown } | undefined)?.id;
  return { line, ...(typeof id === "string" && receiptId.test(id) ? { href: taskHref(id) } : {}) };
}

// Rebuild local links from validated successful outputs, including on reload.
function show(part: ToolPart, today?: string | null): Line | null {
  if (part.state === "output-error" && part.errorText?.startsWith(closeRefusalPrefix)) return null;
  if (part.type === "tool-listPeople") {
    if (pending(part.state)) return { line: "Reading your people…" };
    const rows = (part.output as { people?: unknown } | undefined)?.people;
    return part.state === "output-available" && Array.isArray(rows) && !flag(part.output, "refused")
      ? { line: `Read your people (${rows.length})`, href: "/people" } : { line: "Couldn't read your people" };
  }
  if (["tool-readPerson", "tool-setPersonLastConnected", "tool-setPersonAgreedDay"].includes(part.type)) {
    if (pending(part.state)) return { line: part.type === "tool-readPerson" ? "Reading this person…" : "Updating this person…" };
    const output = part.output as { id?: unknown; name?: unknown; day?: unknown } | undefined;
    if (part.state === "output-available" && !flag(part.output, "refused") && typeof output?.id === "string" && receiptId.test(output.id) && typeof output.name === "string" && output.name) {
      const href = `/people/${output.id}`;
      if (part.type === "tool-readPerson") return { line: `Read '${output.name}'`, href };
      if (part.type === "tool-setPersonAgreedDay" && output.day === null) return { line: `Cleared the agreed day for '${output.name}'`, href };
      if (typeof output.day === "string" && isCalendarDay(output.day)) {
        const date = weekdayMonthDay.format(utcDay(output.day));
        return { line: part.type === "tool-setPersonLastConnected"
          ? `Connected with '${output.name}' ${output.day === today ? "today" : `on ${date}`}`
          : `Agreed to see '${output.name}' on ${date}`, href };
      }
    }
    // A refusal asked which person (or for a rule first); nothing failed.
    if (part.state === "output-available" && flag(part.output, "refused")) {
      const name = (part.output as { name?: unknown }).name;
      return { line: typeof name === "string" && name ? `No change: asked about '${name}'` : "No change: asked which person" };
    }
    return { line: part.type === "tool-readPerson" ? "Couldn't read that person" : "Couldn't update that person" };
  }
  if (part.type === "tool-readSkill") {
    if (pending(part.state)) return { line: "Opening skill…" };
    if (part.state === "output-available" && typeof part.output === "string") {
      if (part.output.startsWith("# habit-design\n")) return { line: "Opened the habit-design skill" };
    }
    return { line: "Couldn't open that skill" };
  }
  if (part.type === "tool-readJournalingArticle") {
    if (pending(part.state)) return { line: "Reading journaling knowledge…" };
    return part.state === "output-available" ? { line: "Journaling: evidence and limits", href: "/coach/knowledge/journaling" } : { line: "Couldn't read journaling knowledge" };
  }
  if (part.type === "tool-searchKnowledge") {
    if (pending(part.state)) return { line: "Looking up knowledge…" };
    const output = part.output as { match?: unknown; title?: unknown; heading?: unknown; href?: unknown } | undefined;
    const title = output?.title;
    const heading = output?.heading;
    const href = title === "People: reach-out rules" ? "/coach/knowledge/people" : title === "Habits"
      ? "/coach/knowledge/habits"
      : title === "Journaling: evidence and limits"
        ? "/coach/knowledge/journaling"
        : undefined;
    if (part.state === "output-available" && output?.match === true && typeof heading === "string" && heading && typeof title === "string" && output.href === href) {
      return { line: `Looked up '${heading}' in ${title}`, href };
    }
    if (part.state === "output-available" && output?.match === false) return { line: "No matching knowledge section" };
    return { line: "Couldn't look up knowledge" };
  }
  if (part.type === "tool-readJournalDay") {
    if (pending(part.state)) return { line: "Reading this Journal day…" };
    const output = part.output as { day?: unknown } | undefined;
    return part.state === "output-available" && typeof output?.day === "string" && isCalendarDay(output.day)
      ? { line: `Read journal for ${output.day}`, href: `/journal/${output.day}` } : { line: "Couldn't read that Journal day" };
  }
  if (part.type === "tool-getJournalTemplate") {
    return { line: pending(part.state) ? "Reading your Journal template…" : part.state === "output-available" ? "Read your Journal template" : "Couldn't read your Journal template" };
  }
  if (part.type === "tool-listInboxDrafts") {
    if (pending(part.state)) return { line: "Reading your Inbox drafts…" };
    const rows = (part.output as { drafts?: unknown } | undefined)?.drafts;
    return { line: part.state === "output-available" && Array.isArray(rows) ? `Read your Inbox drafts (${rows.length})` : "Couldn't read your Inbox drafts" };
  }
  if (part.type === "tool-fileDraft") {
    if (pending(part.state)) return { line: "Filing draft…" };
    const output = part.output as { kind?: unknown; id?: unknown; name?: unknown; notebookId?: unknown; day?: unknown; href?: unknown } | undefined;
    if (part.state === "output-available" && !flag(part.output, "refused") && typeof output?.id === "string" && receiptId.test(output.id)) {
      if (output.kind === "task" && typeof output.name === "string" && (output.href === "/" || output.href === taskHref(output.id))) {
        return { line: `Filed draft as Task '${output.name}'`, href: output.href };
      }
      if (output.kind === "note" && typeof output.name === "string" && typeof output.notebookId === "string" && receiptId.test(output.notebookId)) {
        const href = noteHref(output.notebookId, output.id);
        if (output.href === href) return { line: `Filed draft as Note '${output.name}'`, href };
      }
      if (output.kind === "journal" && typeof output.day === "string" && isCalendarDay(output.day) && output.href === `/journal/${output.day}`) return { line: `Appended draft to journal for ${output.day}`, href: `/journal/${output.day}` };
    }
    return { line: "Couldn't file that draft" };
  }
  if (part.type === "tool-setMood") {
    if (pending(part.state)) return { line: "Setting mood…" };
    const output = part.output as { day?: unknown; mood?: unknown } | undefined;
    if (part.state === "output-available" && !flag(part.output, "refused") && typeof output?.day === "string" && isCalendarDay(output.day) && (output.mood === null || coachMoods.some((mood) => mood === output.mood))) {
      return { line: output.mood === null ? `Cleared mood for ${output.day}` : `Set mood ${output.mood} for ${output.day}`, href: `/journal/${output.day}` };
    }
    return { line: "Couldn't set that mood" };
  }
  if (part.type === "tool-appendJournal") {
    if (pending(part.state)) return { line: "Appending to journal…" };
    const output = part.output as { day?: unknown; id?: unknown } | undefined;
    if (part.state === "output-available" && !flag(part.output, "refused") && typeof output?.day === "string" && isCalendarDay(output.day) && typeof output.id === "string" && receiptId.test(output.id)) {
      return { line: `Appended to journal for ${output.day}`, href: `/journal/${output.day}` };
    }
    return { line: "Couldn't append to that Journal day" };
  }
  if (part.type === "tool-listArea") {
    if (pending(part.state)) return { line: "Reading your list…" };
    const open = (part.output as { open?: unknown } | undefined)?.open;
    if (part.state === "output-available" && typeof open === "number") {
      return { line: `Read your list (${open} open)` };
    }
    return { line: "Couldn't read your list" };
  }
  if (part.type === "tool-createHabit" || part.type === "tool-trackHabit") {
    const creating = part.type === "tool-createHabit";
    if (pending(part.state)) return { line: creating ? "Creating a habit…" : "Tracking a habit…" };
    const output = part.output as { id?: unknown; name?: unknown; href?: unknown; day?: unknown; period?: unknown; action?: unknown; changed?: unknown; count?: unknown } | undefined;
    const refusal = part.output as { reason?: unknown; count?: unknown } | undefined;
    if (!creating && part.state === "output-available" && flag(part.output, "refused") && typeof output?.name === "string" && output.name && typeof output.day === "string" && isCalendarDay(output.day) && (output.period === "day" || output.period === "week")) {
      // An undo Bearing declined: a checked result, not a failure.
      if (refusal?.reason === "nothingToUndo") return { line: `Nothing to undo for '${output.name}' for ${habitPeriodWords(output.period, output.day, today)}`, href: "/habits" };
      if (refusal?.reason === "changedSince" && typeof refusal.count === "number") return { line: `'${output.name}' has changed since (now ${refusal.count})`, href: "/habits" };
    }
    if (part.state === "output-available" && !flag(part.output, "refused") && typeof output?.id === "string" && receiptId.test(output.id) && typeof output.name === "string" && output.name && output.href === "/habits") {
      if (creating) return { line: `Created habit '${output.name}'`, href: "/habits" };
      if (typeof output.day === "string" && isCalendarDay(output.day) && (output.period === "day" || output.period === "week") && habitPeriodDay(output.period, output.day) === output.day && ["did", "undo", "didnt", "markDone", "setCount"].includes(String(output.action)) && typeof output.changed === "boolean") {
        const period = habitPeriodWords(output.period, output.day, today);
        if (!output.changed) return { line: `No change to '${output.name}' for ${period}`, href: "/habits" };
        if (output.action === "setCount") {
          if (typeof output.count !== "number" || !Number.isInteger(output.count) || output.count < 0 || output.count > (output.period === "week" ? 999 : 99)) return { line: "Couldn't track that habit" };
          return { line: `Set '${output.name}' to ${output.count} for ${period}`, href: "/habits" };
        }
        const verb = output.action === "undo" || output.action === "didnt" ? "Undid" : "Tracked";
        return { line: `${verb} '${output.name}' for ${period}`, href: "/habits" };
      }
    }
    return { line: creating ? "Couldn't create that habit" : "Couldn't track that habit" };
  }
  if (part.type === "tool-listHabits") {
    if (pending(part.state)) return { line: "Reading your habits…" };
    const output = part.output as { habits?: unknown; day?: unknown } | undefined;
    const habits = output?.habits;
    const day = output?.day;
    return part.state === "output-available" && Array.isArray(habits)
      && (day === undefined || (typeof day === "string" && isCalendarDay(day)))
      ? { line: `Read your habits${day === undefined ? "" : ` for ${habitPeriodWords("day", day, today)}`} (${habits.length})`, href: "/habits" }
      : { line: "Couldn't read your habits" };
  }
  if (part.type === "tool-listNotebooks") {
    if (pending(part.state)) return { line: "Reading your notebooks…" };
    const books = (part.output as { notebooks?: unknown } | undefined)?.notebooks;
    return { line: part.state === "output-available" && Array.isArray(books) ? `Read your notebooks (${books.length})` : "Couldn't read your notebooks" };
  }
  if (part.type === "tool-createNote") {
    if (pending(part.state)) return { line: "Creating a Note…" };
    const output = part.output as { id?: unknown; notebookId?: unknown; href?: unknown } | undefined;
    const name = nameOf(part.output);
    const notebookId = output?.notebookId === null || (typeof output?.notebookId === "string" && receiptId.test(output.notebookId)) ? output.notebookId : undefined;
    if (part.state === "output-available" && !flag(part.output, "refused") && name !== undefined && typeof output?.id === "string" && receiptId.test(output.id) && notebookId !== undefined) {
      const href = noteHref(notebookId, output.id);
      if (output.href === href) return { line: `Created Note '${name}'`, href };
    }
    return { line: "Couldn't create that Note" };
  }
  if (part.type === "tool-createTask") {
    if (pending(part.state)) return { line: "Creating a task…" };
    const name = nameOf(part.output);
    const output = part.output as { id?: unknown; href?: unknown } | undefined;
    if (part.state === "output-available" && name !== undefined) {
      const href = typeof output?.id === "string" && receiptId.test(output.id) && output.href === taskHref(output.id)
        ? output.href
        : "/";
      return { line: `Created task '${name}'`, href };
    }
    return { line: "Couldn't create that task" };
  }
  if (part.type === "tool-completeTask") {
    if (pending(part.state)) return { line: "Completing…" };
    const name = nameOf(part.output);
    if (part.state === "output-available" && name !== undefined) {
      return taskReceipt(`Completed '${name}'`, part.output);
    }
    if (part.state === "output-available" && flag(part.output, "invalidId")) {
      return { line: "That Task id isn't valid" };
    }
    if (part.state === "output-available" && flag(part.output, "notFound")) {
      return { line: "Couldn't find that task" };
    }
    return { line: "Couldn't complete that task" };
  }
  if (part.type === "tool-scheduleTask") {
    if (pending(part.state)) return { line: "Scheduling…" };
    const name = nameOf(part.output);
    if (part.state === "output-available" && name !== undefined) {
      return taskReceipt(`Scheduled '${name}'`, part.output);
    }
    return { line: "Couldn't schedule that task" };
  }
  if (part.type === "tool-updateTask") {
    if (pending(part.state)) return { line: "Updating…" };
    const name = nameOf(part.output);
    if (part.state === "output-available" && name !== undefined) {
      return taskReceipt(`Updated '${name}'`, part.output);
    }
    return { line: "Couldn't update that task" };
  }
  return null;
}

export function receipt(part: ToolPart, today?: string | null): string | null {
  return show(part, today)?.line ?? null;
}

type Part = ToolPart & { toolCallId?: string; text?: string };

export type ShownPart =
  | { key: string; text: string }
  | { key: string; receipt: string; calls: number; href?: string; read?: true };

// Reads show muted and plain; only writes look like actions.
// One list for every read tool part type, shared with the web app's Applied
// writes block so a read can never be shown as a saved write.
export const coachReadToolTypes: ReadonlySet<string> = new Set(["tool-listPeople", "tool-readPerson", "tool-readSkill", "tool-listArea", "tool-listHabits", "tool-listNotebooks", "tool-listInboxDrafts", "tool-searchKnowledge", "tool-readJournalingArticle", "tool-readJournalDay", "tool-getJournalTemplate"]);

// What a message shows: its text and its receipts, in order. A finished
// listArea read with the same result as the receipt just before it (nothing
// shown in between) adds no line of its own, so a reply that read the list
// twice shows it once; `calls` counts the reads behind each receipt. A write
// stays its own line even when the next write looks the same. A receipt keeps
// the tool-call id of its first call as its key. A successful create links to
// the Task page when the stored output has that address, and to the Priority
// List when it does not. Complete, schedule and update link when a valid Task
// id is present in the successful output.
// Every real failure keeps its receipt, even when a later call succeeds; a
// Daily close refusal renders nothing (see show()).
export function shownParts(parts: readonly Part[], today?: string | null): ShownPart[] {
  const shown: ShownPart[] = [];
  const lines = parts.map((part) => show(part, today));
  let lastPart: Part | undefined;
  parts.forEach((part, i) => {
    if (part.type === "text") {
      shown.push({ key: `text-${i}`, text: part.text ?? "" });
      return;
    }
    const line = lines[i];
    if (!line) return;
    const lastShown = shown.at(-1);
    const repeat =
      part.type === "tool-listArea" &&
      lastPart?.type === part.type &&
      lastPart.state === "output-available" &&
      part.state === "output-available" &&
      JSON.stringify(lastPart.output) === JSON.stringify(part.output);
    if (repeat && lastShown && "calls" in lastShown) lastShown.calls += 1;
    else {
      const key = part.toolCallId ?? `part-${i}`;
      shown.push({
        key,
        receipt: line.line,
        calls: 1,
        ...(line.href && { href: line.href }),
        ...(coachReadToolTypes.has(part.type) && { read: true as const }),
      });
    }
    lastPart = part;
  });
  return shown;
}
