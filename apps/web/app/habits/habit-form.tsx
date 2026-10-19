"use client";

import { habitCountCap, type HabitPeriod } from "@repo/domain";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Input } from "@repo/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import type { HabitListItem } from "../../lib/habits";
import { addHabit, saveHabit } from "./actions";

// Inline text for the goal field, worded as the server's refusal; the server still checks.
function habitGoalError(goal: string, bad: boolean, period: HabitPeriod): string {
  if (bad && !goal.trim()) return "";
  const cap = habitCountCap(period);
  const periodLabel = period === "week" ? "weekly" : "daily";
  const number = Number(goal.trim());
  return goal.trim() && Number.isInteger(number) && number >= 1 && number <= cap ? "" : bad ? `Enter a whole-number limit between 1 and ${cap}, or leave it empty.` : `Enter a whole-number ${periodLabel} goal between 1 and ${cap}.`;
}

export function HabitForm({ habit, today, onSaved, onCancel }: { habit?: HabitListItem; today?: string; onSaved?: () => void; onCancel?: () => void }) {
  const id = useId();
  const [name, setName] = useState(habit?.name ?? "");
  const [period, setPeriod] = useState<"day" | "week">(habit?.period ?? "day");
  const [trackMode, setTrackMode] = useState<"once" | "many">(habit?.trackMode ?? "once");
  const [bad, setBad] = useState(habit?.bad ?? false);
  const [goal, setGoal] = useState(habit?.goalCount?.toString() ?? "");
  const [error, setError] = useState("");
  const [goalError, setGoalError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return <form className={`panel habit-form${habit ? " habit-edit-form" : ""}`} aria-label={habit ? `Edit ${habit.name}` : "Add habit"} noValidate onSubmit={(event) => {
    event.preventDefault();
    if (trackMode === "many") {
      const problem = habitGoalError(goal, bad, period);
      setGoalError(problem);
      if (problem) return;
    }
    start(async () => {
      setError("");
      try {
        const goalCount = trackMode === "many" && goal.trim() ? Number(goal) : null;
        const result = habit
          ? await saveHabit(habit.id, { name, trackMode, goalCount, bad, period }, today!)
          : await addHabit(name, trackMode, goalCount, bad, period);
        if ("error" in result) setError(result.error);
        else {
          if (!habit) {
            setName("");
            setGoal("");
          }
          onSaved?.();
          router.refresh();
          window.dispatchEvent(new Event("habits-changed"));
        }
      } catch { setError("Could not save the habit. Please try again."); }
    });
  }}>
    <FieldGroup><Field><FieldLabel htmlFor={`${id}-habit-name`}>{habit ? "Name" : "New habit"}</FieldLabel>
      <Input id={`${id}-habit-name`} value={name} onChange={(event) => { setName(event.target.value); if (error) setError(""); }} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-habit-name-error` : undefined} autoComplete="off" disabled={pending} />
    </Field>
      <Field><FieldLabel htmlFor={`${id}-habit-period`}>Period</FieldLabel>
        <NativeSelect id={`${id}-habit-period`} value={period} onChange={(event) => {
          const next = event.target.value as "day" | "week";
          setPeriod(next);
          setGoalError("");
        }} disabled={pending}>
          <NativeSelectOption value="day">Daily</NativeSelectOption>
          <NativeSelectOption value="week">Weekly</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field><FieldLabel htmlFor={`${id}-habit-mode`}>Track</FieldLabel>
        <NativeSelect id={`${id}-habit-mode`} value={trackMode} onChange={(event) => { setTrackMode(event.target.value as "once" | "many"); setGoalError(""); }} disabled={pending}>
          <NativeSelectOption value="once">{period === "week" ? "Once a week" : "Once a day"}</NativeSelectOption>
          <NativeSelectOption value="many">{period === "week" ? "Many-times a week" : "Many-times a day"}</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field orientation="horizontal">
        <Checkbox id={`${id}-habit-bad`} checked={bad} onCheckedChange={(checked) => { setBad(checked); setGoalError(""); }} disabled={pending} />
        <FieldLabel htmlFor={`${id}-habit-bad`}>Bad</FieldLabel>
      </Field>
      {trackMode === "many" && <Field><FieldLabel htmlFor={`${id}-habit-goal`}>{bad ? "Limit (optional)" : period === "week" ? "Weekly goal" : "Daily goal"}</FieldLabel>
        <Input id={`${id}-habit-goal`} type="number" inputMode="numeric" min={1} max={habitCountCap(period)} step={1} required={!bad} value={goal} onChange={(event) => { setGoal(event.target.value); if (goalError) setGoalError(""); }} aria-invalid={error || goalError ? true : undefined} aria-describedby={goalError ? `${id}-habit-goal-error` : error ? `${id}-habit-name-error` : undefined} disabled={pending} />
        {goalError && <p id={`${id}-habit-goal-error`} className="field-error">{goalError}</p>}
      </Field>}
    </FieldGroup>
    {error && <p id={`${id}-habit-name-error`} role="alert" className="field-error">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {onCancel && <Button type="button" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button>}
      <Button type="submit" disabled={pending}>{pending ? (habit ? "Saving…" : "Adding…") : habit ? "Save changes" : "Add habit"}</Button>
    </div>
  </form>;
}
