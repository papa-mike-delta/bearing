"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { habitOverGoal, mondayOf, shiftWeek, weekDays } from "@repo/domain";
import { Button } from "@repo/ui/components/button";
import { formatJournalDay } from "../../lib/journal-day";
import { useBrowserToday } from "../browser-today";
import type { HabitListItem } from "../../lib/habits";
import { countHabitDay, markHabitDay, removeHabit } from "./actions";

type HabitRow = HabitListItem;

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function href(today: string, week: string) {
  return `/habits?today=${today}&week=${week}`;
}

function weekLabel(week: string) {
  const days = weekDays(week);
  if (!days) return week;
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const start = new Date(`${days[0]}T00:00:00.000Z`);
  const end = new Date(`${days[6]}T00:00:00.000Z`);
  return `${format.format(start)} – ${format.format(end)}, ${end.getUTCFullYear()}`;
}

function TrackBrowserToday({ today, week }: { today: string; week: string }) {
  const browser = useBrowserToday();
  const router = useRouter();
  useEffect(() => {
    if (!browser || browser === today) return;
    const current = mondayOf(browser);
    if (!current) return;
    const nextWeek = mondayOf(week) === week && week <= current ? week : current;
    router.replace(href(browser, nextWeek));
  }, [browser, today, week, router]);
  return null;
}

function WeekNav({ today, week, current }: { today: string; week: string; current: string | null }) {
  const previous = shiftWeek(week, -1);
  const next = shiftWeek(week, 1);
  const nextOpen = Boolean(current && next && next <= current);
  return <nav aria-label="Weeks" className="mb-6 flex flex-wrap items-center gap-3">
    {previous ? <Button variant="outline" nativeButton={false} render={<Link href={href(today, previous)} />}>Previous</Button> : <Button variant="outline" disabled>Previous</Button>}
    <span>{weekLabel(week)}</span>
    {nextOpen && next ? <Button variant="outline" nativeButton={false} render={<Link href={href(today, next)} />}>Next</Button> : <Button variant="outline" disabled>Next</Button>}
    {current && week !== current ? <Button variant="outline" nativeButton={false} render={<Link href={href(today, current)} />}>This week</Button> : null}
  </nav>;
}

function HabitGrid({ today, week, habits }: { today: string; week: string; habits: HabitRow[] }) {
  const days = weekDays(week) ?? [];
  const [rows, setRows] = useState(habits);
  const [error, setError] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();

  function saved() {
    router.refresh();
    window.dispatchEvent(new Event("habits-changed"));
  }

  function toggle(habit: HabitRow, day: string, checked: boolean) {
    const marked = checked ? [...new Set([...habit.marked, day])].sort() : habit.marked.filter((item) => item !== day);
    setError("");
    setPendingKey(`${habit.id}:${day}`);
    setRows((current) => current.map((row) => row.id === habit.id ? { ...row, marked } : row));
    start(async () => {
      try {
        const result = await markHabitDay(habit.id, day, checked, today);
        if ("error" in result) {
          setRows(habits);
          setError(result.error);
        } else {
          setRows((current) => current.map((row) => row.id === habit.id ? { ...row, marked, done: result.done, streak: result.streak, record: result.record } : row));
          saved();
        }
      } catch {
        setRows(habits);
        setError("Could not save. Please try again.");
      } finally { setPendingKey(null); }
    });
  }

  function changeCount(habit: HabitRow, day: string, delta: 1 | -1) {
    setError("");
    setPendingKey(`${habit.id}:${day}`);
    start(async () => {
      try {
        const result = await countHabitDay(habit.id, day, delta, today);
        if ("error" in result) setError(result.error);
        else {
          setRows((current) => current.map((row) => row.id === habit.id ? {
            ...row, counts: { ...row.counts, [day]: result.count },
            ...(day === today ? { count: result.count, done: result.done } : {}),
          } : row));
          saved();
        }
      } catch { setError("Could not save. Please try again."); }
      finally { setPendingKey(null); }
    });
  }

  function remove(habit: HabitRow) {
    setConfirming(null);
    setError("");
    setPendingKey(habit.id);
    start(async () => {
      try {
        const result = await removeHabit(habit.id);
        if ("error" in result && result.error) setError(result.error);
        else {
          setRows((current) => current.filter((row) => row.id !== habit.id));
          saved();
        }
      } catch { setError("Could not delete. Please try again."); }
      finally { setPendingKey(null); }
    });
  }

  if (!rows.length) return <p className="empty-state">No daily habits yet. Add one to start marking days.</p>;
  return <>
    {error && <p role="alert">{error}</p>}
    <div className="habit-grid">
      <table>
        <caption className="sr-only">Daily habits for {weekLabel(week)}</caption>
        <thead><tr>
          <th className="habit-name" scope="col">Habit</th>
          {days.map((day, index) => <th key={day} className="day" scope="col" aria-current={day === today ? "date" : undefined}><span className="day-long">{weekdays[index]}</span><span className="day-short" aria-hidden="true">{weekdays[index]![0]}</span><span className="day-number">{Number(day.slice(8))}</span></th>)}
          <th className="habit-stat" scope="col">Streak</th>
          <th className="habit-stat" scope="col">Record</th>
        </tr></thead>
        <tbody>
          {rows.map((habit) => <tr key={habit.id} className={[habit.trackMode === "many" ? "habit-many" : "", habit.bad ? "habit-bad" : ""].join(" ")}>
            <th className="habit-name" scope="row">
              <span className="habit-title">{habit.name}</span>
              {habit.bad && <span className="habit-bad-label">Bad</span>}
              {habit.trackMode === "many"
                ? <span className="habit-goal">{habit.goalCount !== null ? `${habit.bad ? "Limit" : "Daily goal"} ${habit.goalCount}` : "Count"}</span>
                : !habit.bad && <span className="habit-meta">Streak {habit.streak} · Record {habit.record}</span>}
              {confirming === habit.id ? <span className="habit-confirm" role="group" aria-label={`Delete ${habit.name}?`}>
                <span>Delete it and every marked day?</span>
                <Button type="button" variant="destructive" size="sm" onClick={() => remove(habit)}>Delete</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep</Button>
              </span> : <Button type="button" variant="link" size="sm" className="habit-delete" disabled={pendingKey !== null} aria-label={`Delete ${habit.name}`} onClick={() => setConfirming(habit.id)}>Delete</Button>}
            </th>
            {days.map((day) => {
              const closed = day > today;
              const count = habit.counts[day] ?? 0;
              const met = !habit.bad && habit.goalCount !== null && count >= habit.goalCount;
              const over = habitOverGoal(habit, count);
              if (habit.trackMode === "many") return <td key={day} className="day">
                <div className="habit-counter" role="group" aria-label={`${habit.name} on ${formatJournalDay(day)}`}>
                  <output className={[met ? "habit-met-goal" : "", over ? "habit-over-goal" : ""].join(" ")} aria-label={`${habit.name} count on ${formatJournalDay(day)}`} aria-live="polite">{count}{habit.goalCount !== null && <><span className="habit-of-goal" aria-hidden="true">/{habit.goalCount}</span><span className="sr-only">{habit.bad ? " of limit " : " of "}{habit.goalCount}{met ? ", done" : ""}</span></>}</output>
                  <Button type="button" variant="outline" className="habit-step" disabled={closed || pendingKey !== null} aria-label={`Add one to ${habit.name} on ${formatJournalDay(day)}`} onClick={() => changeCount(habit, day, 1)}>+</Button>
                  <Button type="button" variant="outline" className="habit-step" disabled={closed || count === 0 || pendingKey !== null} aria-label={`Remove one from ${habit.name} on ${formatJournalDay(day)}`} onClick={() => changeCount(habit, day, -1)}>{"\u2212"}</Button>
                </div>
              </td>;
              return <td key={day} className="day"><input
                type="checkbox"
                checked={habit.marked.includes(day)}
                disabled={closed || pendingKey !== null}
                aria-label={`${habit.name} on ${formatJournalDay(day)}`}
                onChange={(event) => toggle(habit, day, event.target.checked)}
              /></td>;
            })}
            <td className="habit-stat">{habit.trackMode === "once" && !habit.bad ? habit.streak : "—"}</td>
            <td className="habit-stat">{habit.trackMode === "once" && !habit.bad ? habit.record : "—"}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </>;
}

export function HabitBoard({ today, week, habits }: { today: string; week: string; habits: HabitRow[] }) {
  const current = mondayOf(today);
  const open = current !== null && week <= current;
  const signature = habits.map((habit) => [habit.id, habit.name, habit.streak, habit.record, habit.marked.join(","), habit.trackMode, habit.goalCount, habit.bad, JSON.stringify(habit.counts)].join(":")).join("|");
  return <>
    <TrackBrowserToday today={today} week={week} />
    <h2 className="habits-daily">Daily</h2>
    <WeekNav today={today} week={week} current={current} />
    {open ? <HabitGrid key={signature} today={today} week={week} habits={habits} /> : <p>This week is not open yet.</p>}
  </>;
}
