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

function href(today: string, week: string, weeklyWeek: string) {
  return `/habits?today=${today}&week=${week}&weekly=${weeklyWeek}`;
}

function weekLabel(week: string, startWeek = week) {
  const days = weekDays(startWeek);
  if (!days) return week;
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const start = new Date(`${days[0]}T00:00:00.000Z`);
  const end = new Date(`${weekDays(week)?.[6]}T00:00:00.000Z`);
  return `${format.format(start)} – ${format.format(end)}, ${end.getUTCFullYear()}`;
}

function TrackBrowserToday({ today, week, weeklyWeek }: { today: string; week: string; weeklyWeek: string }) {
  const browser = useBrowserToday();
  const router = useRouter();
  useEffect(() => {
    if (!browser || browser === today) return;
    const current = mondayOf(browser);
    if (!current) return;
    const nextWeek = mondayOf(week) === week && week <= current ? week : current;
    router.replace(href(browser, nextWeek, weeklyWeek <= current ? weeklyWeek : current));
  }, [browser, today, week, weeklyWeek, router]);
  return null;
}

function WeekNav({ today, week, weeklyWeek, current, weekly = false }: { today: string; week: string; weeklyWeek: string; current: string | null; weekly?: boolean }) {
  const link = (target: string) => weekly ? href(today, week, target) : href(today, target, weeklyWeek);
  const shown = weekly ? weeklyWeek : week;
  const previous = shiftWeek(shown, -1);
  const next = shiftWeek(shown, 1);
  const nextOpen = Boolean(current && next && next <= current);
  return <nav aria-label={weekly ? "Weekly habit weeks" : "Daily habit weeks"} className="mb-6 flex flex-wrap items-center gap-3">
    {previous ? <Button variant="outline" nativeButton={false} render={<Link href={link(previous)} />}>Previous</Button> : <Button variant="outline" disabled>Previous</Button>}
    <span>{weekLabel(shown, weekly ? shiftWeek(shown, -3) ?? shown : shown)}</span>
    {nextOpen && next ? <Button variant="outline" nativeButton={false} render={<Link href={link(next)} />}>Next</Button> : <Button variant="outline" disabled>Next</Button>}
    {current && shown !== current ? <Button variant="outline" nativeButton={false} render={<Link href={link(current)} />}>This week</Button> : null}
  </nav>;
}

function HabitGrid({ today, week, habits, weekly = false }: { today: string; week: string; habits: HabitRow[]; weekly?: boolean }) {
  const days = weekly ? [-3, -2, -1, 0].flatMap((offset) => shiftWeek(week, offset) ?? []) : weekDays(week) ?? [];
  const unit = weekly ? " weeks" : "";
  const label = (day: string) => weekly ? `week of ${weekLabel(day)}` : `on ${formatJournalDay(day)}`;
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

  if (!rows.length) return <p className="empty-state">No {weekly ? "weekly" : "daily"} habits yet. Add one to start marking {weekly ? "weeks" : "days"}.</p>;
  return <>
    {error && <p role="alert">{error}</p>}
    <div className={`habit-grid${weekly ? " habit-weekly-grid" : ""}`}>
      <table>
        <caption className="sr-only">{weekly ? "Weekly" : "Daily"} habits for {weekLabel(week, days[0])}</caption>
        <thead><tr>
          <th className="habit-name" scope="col">Habit</th>
          {days.map((day, index) => <th key={day} className="day" scope="col" aria-current={(weekly ? day === mondayOf(today) : day === today) ? "date" : undefined}>
            {weekly ? <><span className="sr-only">Week of {weekLabel(day)}</span><span aria-hidden="true">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`))}</span></> : <><span className="day-long">{weekdays[index]}</span><span className="day-short" aria-hidden="true">{weekdays[index]![0]}</span><span className="day-number">{Number(day.slice(8))}</span></>}
          </th>)}
          <th className="habit-stat" scope="col">Streak{unit}</th>
          <th className="habit-stat" scope="col">Record{unit}</th>
        </tr></thead>
        <tbody>
          {rows.map((habit) => <tr key={habit.id} className={[habit.trackMode === "many" ? "habit-many" : "", habit.bad ? "habit-bad" : ""].join(" ")}>
            <th className="habit-name" scope="row">
              <span className="habit-title">{habit.name}</span>
              {habit.bad && <span className="habit-bad-label">Bad</span>}
              {habit.trackMode === "many"
                ? habit.goalCount !== null && <span className="habit-goal">{`${habit.bad ? "Limit" : "Daily goal"} ${habit.goalCount}`}</span>
                : !habit.bad && <span className="habit-meta">Streak {habit.streak}{unit} · Record {habit.record}{unit}</span>}
              {confirming === habit.id ? <span className="habit-confirm" role="group" aria-label={`Delete ${habit.name}?`}>
                <span>Delete it and every marked day?</span>
                <Button type="button" variant="destructive" size="sm" onClick={() => remove(habit)}>Delete</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep</Button>
              </span> : <Button type="button" variant="link" size="sm" className="habit-delete" disabled={pendingKey !== null} aria-label={`Delete ${habit.name}`} onClick={() => setConfirming(habit.id)}>Delete</Button>}
            </th>
            {days.map((day) => {
              const closed = day > (weekly ? mondayOf(today)! : today);
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
                aria-label={`${habit.name} ${label(day)}`}
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

export function HabitBoard({ today, week, weeklyWeek, habits }: { today: string; week: string; weeklyWeek: string; habits: HabitRow[] }) {
  const current = mondayOf(today);
  const signature = JSON.stringify(habits);
  return <>
    <TrackBrowserToday today={today} week={week} weeklyWeek={weeklyWeek} />
    <h2 className="habits-daily">Daily</h2>
    <WeekNav today={today} week={week} weeklyWeek={weeklyWeek} current={current} />
    {current && week <= current ? <HabitGrid key={`day:${week}:${signature}`} today={today} week={week} habits={habits.filter((habit) => habit.period === "day")} /> : <p>This week is not open yet.</p>}
    <h2 className="habits-daily">Weekly</h2>
    <WeekNav today={today} week={week} weeklyWeek={weeklyWeek} current={current} weekly />
    {current && weeklyWeek <= current ? <HabitGrid key={`week:${weeklyWeek}:${signature}`} today={today} week={weeklyWeek} habits={habits.filter((habit) => habit.period === "week")} weekly /> : <p>This week is not open yet.</p>}
  </>;
}
