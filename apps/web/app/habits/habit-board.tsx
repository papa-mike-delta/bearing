"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mondayOf, shiftWeek, weekDays } from "@repo/domain";
import { Button } from "@repo/ui/components/button";
import { formatJournalDay } from "../../lib/journal-day";
import { useBrowserToday } from "../browser-today";
import { markHabitDay, removeHabit } from "./actions";

type HabitRow = { id: string; name: string; marked: string[]; done: boolean; streak: number; record: number };

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

  function remove(habit: HabitRow) {
    if (!window.confirm("Delete this habit and every marked day?")) return;
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
          {days.map((day, index) => <th key={day} className="day" scope="col" aria-current={day === today ? "date" : undefined}>{weekdays[index]}<span className="day-number">{Number(day.slice(8))}</span></th>)}
          <th scope="col">Streak</th>
          <th scope="col">Record</th>
          <th scope="col"><span className="sr-only">Delete</span></th>
        </tr></thead>
        <tbody>
          {rows.map((habit) => <tr key={habit.id}>
            <th className="habit-name" scope="row">{habit.name}</th>
            {days.map((day) => {
              const closed = day > today;
              return <td key={day} className="day"><input
                type="checkbox"
                checked={habit.marked.includes(day)}
                disabled={closed || pendingKey?.startsWith(habit.id) === true}
                aria-label={`${habit.name} on ${formatJournalDay(day)}`}
                onChange={(event) => toggle(habit, day, event.target.checked)}
              /></td>;
            })}
            <td>{habit.streak}</td>
            <td>{habit.record}</td>
            <td><Button type="button" variant="destructive" size="sm" disabled={pendingKey?.startsWith(habit.id) === true} aria-label={`Delete ${habit.name}`} onClick={() => remove(habit)}>Delete</Button></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </>;
}

export function HabitBoard({ today, week, habits }: { today: string; week: string; habits: HabitRow[] }) {
  const current = mondayOf(today);
  const open = current !== null && week <= current;
  const signature = habits.map((habit) => [habit.id, habit.name, habit.streak, habit.record, habit.marked.join(",")].join(":")).join("|");
  return <>
    <TrackBrowserToday today={today} week={week} />
    <h2>Daily</h2>
    <WeekNav today={today} week={week} current={current} />
    {open ? <HabitGrid key={signature} today={today} week={week} habits={habits} /> : <p>This week is not open yet.</p>}
  </>;
}
