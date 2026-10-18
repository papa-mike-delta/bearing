import type { Metadata } from "next";
import { isCalendarDay, mondayOf, weekDays } from "@repo/domain";
import { requireUser } from "../../auth";
import { listHabits } from "../../lib/habits";
import { Header } from "../header";
import { HabitBoard } from "./habit-board";
import { HabitForm } from "./habit-form";
import { OpenWeek } from "./open-week";

export const metadata: Metadata = { title: "Habits · Bearing", description: "Track daily habits on this week." };

export default async function HabitsPage({ searchParams }: { searchParams: Promise<{ today?: string; week?: string }> }) {
  const user = await requireUser();
  const { today, week } = await searchParams;
  const days = week && mondayOf(week) === week ? weekDays(week) : null;
  if (!today || !isCalendarDay(today) || !days) {
    return <><Header email={user.email} /><main className="font-sans"><h1>Habits</h1><OpenWeek /></main></>;
  }
  const habits = (await listHabits(user.id, today, days)).filter((habit) => habit.period === "day" && !habit.bad);
  return <><Header email={user.email} /><main className="font-sans">
    <h1>Habits</h1>
    <p className="habits-intro">Check or count today, or a past day, when you do it. Once-habits show streaks; many-times habits show a count toward a daily goal.</p>
    <HabitForm />
    <HabitBoard today={today} week={week!} habits={habits} />
  </main></>;
}
