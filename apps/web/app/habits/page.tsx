import type { Metadata } from "next";
import { isCalendarDay, mondayOf, weekDays } from "@repo/domain";
import { requireUser } from "../../auth";
import { listHabits } from "../../lib/habits";
import { Header } from "../header";
import { HabitBoard } from "./habit-board";
import { HabitForm } from "./habit-form";
import { OpenWeek } from "./open-week";

export const metadata: Metadata = { title: "Habits · Bearing", description: "Mark daily habits on this week." };

export default async function HabitsPage({ searchParams }: { searchParams: Promise<{ today?: string; week?: string }> }) {
  const user = await requireUser();
  const { today, week } = await searchParams;
  const days = week && mondayOf(week) === week ? weekDays(week) : null;
  if (!today || !isCalendarDay(today) || !days) {
    return <><Header email={user.email} /><main className="font-sans"><h1>Habits</h1><OpenWeek /></main></>;
  }
  const habits = await listHabits(user.id, today, days);
  return <><Header email={user.email} /><main className="font-sans">
    <h1>Habits</h1>
    <p>Check today, or a past day, when you do it. An empty today does not break the streak.</p>
    <HabitForm />
    <HabitBoard today={today} week={week!} habits={habits} />
  </main></>;
}
