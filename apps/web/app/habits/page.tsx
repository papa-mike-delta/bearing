import type { Metadata } from "next";
import { isCalendarDay, mondayOf, shiftWeek, weekDays } from "@repo/domain";
import { requireUser } from "../../auth";
import { listHabits } from "../../lib/habits";
import { Header } from "../header";
import { HabitBoard } from "./habit-board";
import { HabitForm } from "./habit-form";
import { OpenWeek } from "./open-week";

export const metadata: Metadata = { title: "Habits · Bearing", description: "Track daily and weekly habits." };

export default async function HabitsPage({ searchParams }: { searchParams: Promise<{ today?: string; week?: string; weekly?: string }> }) {
  const user = await requireUser();
  const { today, week, weekly } = await searchParams;
  const days = week && mondayOf(week) === week ? weekDays(week) : null;
  if (!today || !isCalendarDay(today) || !days) {
    return <><Header email={user.email} /><main className="font-sans"><h1>Habits</h1><OpenWeek /></main></>;
  }
  const weeklyWeek = weekly && mondayOf(weekly) === weekly ? weekly : mondayOf(today)!;
  const weeks = [-3, -2, -1, 0].flatMap((offset) => shiftWeek(weeklyWeek, offset) ?? []);
  const habits = await listHabits(user.id, today, [...days, ...weeks]);
  return <><Header email={user.email} /><main className="font-sans">
    <h1>Habits</h1>
    <p className="habits-intro">Check or count a day, or check a Monday–Sunday week, when you do it. Bad habits count lapses without streaks. Other once-habits show streaks; many-times habits show a count toward a daily goal.</p>
    <HabitForm />
    <HabitBoard today={today} week={week!} weeklyWeek={weeklyWeek} habits={habits} />
  </main></>;
}
