"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { addHabit } from "./actions";

// Inline text for the goal field, worded as the server's refusal; the server still checks.
function dailyGoalError(goal: string): string {
  const number = Number(goal.trim());
  return goal.trim() && Number.isInteger(number) && number >= 1 && number <= 99 ? "" : "Enter a whole-number daily goal between 1 and 99.";
}

export function HabitForm() {
  const [name, setName] = useState("");
  const [trackMode, setTrackMode] = useState<"once" | "many">("once");
  const [goal, setGoal] = useState("");
  const [error, setError] = useState("");
  const [goalError, setGoalError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return <form className="panel habit-form" noValidate onSubmit={(event) => {
    event.preventDefault();
    if (trackMode === "many") {
      const problem = dailyGoalError(goal);
      setGoalError(problem);
      if (problem) return;
    }
    start(async () => {
      setError("");
      try {
        const result = await addHabit(name, trackMode, trackMode === "many" && goal.trim() ? Number(goal) : null);
        if ("error" in result) setError(result.error);
        else {
          setName("");
          setGoal("");
          router.refresh();
          window.dispatchEvent(new Event("habits-changed"));
        }
      } catch { setError("Could not add the habit. Please try again."); }
    });
  }}>
    <FieldGroup><Field><FieldLabel htmlFor="habit-name">New habit</FieldLabel>
      <Input id="habit-name" value={name} onChange={(event) => { setName(event.target.value); if (error) setError(""); }} aria-invalid={error ? true : undefined} aria-describedby={error ? "habit-name-error" : undefined} autoComplete="off" disabled={pending} />
    </Field>
      <Field><FieldLabel htmlFor="habit-mode">Track</FieldLabel>
        <NativeSelect id="habit-mode" value={trackMode} onChange={(event) => { setTrackMode(event.target.value as "once" | "many"); setGoalError(""); }} disabled={pending}>
          <NativeSelectOption value="once">Once a day</NativeSelectOption>
          <NativeSelectOption value="many">Many-times a day</NativeSelectOption>
        </NativeSelect>
      </Field>
      {trackMode === "many" && <Field><FieldLabel htmlFor="habit-goal">Daily goal</FieldLabel>
        <Input id="habit-goal" type="number" inputMode="numeric" min={1} max={99} step={1} required value={goal} onChange={(event) => { setGoal(event.target.value); if (goalError) setGoalError(""); }} aria-invalid={error || goalError ? true : undefined} aria-describedby={goalError ? "habit-goal-error" : error ? "habit-name-error" : undefined} disabled={pending} />
        {goalError && <p id="habit-goal-error" className="field-error">{goalError}</p>}
      </Field>}
    </FieldGroup>
    {error && <p id="habit-name-error" role="alert" className="field-error">{error}</p>}
    <Button type="submit" disabled={pending} className="self-end">{pending ? "Adding…" : "Add habit"}</Button>
  </form>;
}
