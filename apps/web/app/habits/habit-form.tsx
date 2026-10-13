"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import { addHabit } from "./actions";

export function HabitForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return <form className="panel" onSubmit={(event) => {
    event.preventDefault();
    start(async () => {
      setError("");
      try {
        const result = await addHabit(name);
        if ("error" in result) setError(result.error);
        else {
          setName("");
          router.refresh();
          window.dispatchEvent(new Event("habits-changed"));
        }
      } catch { setError("Could not add the habit. Please try again."); }
    });
  }}>
    <FieldGroup><Field><FieldLabel htmlFor="habit-name">New habit</FieldLabel>
      <Input id="habit-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required autoComplete="off" disabled={pending} />
    </Field></FieldGroup>
    {error && <p role="alert">{error}</p>}
    <Button type="submit" disabled={pending} className="self-end">{pending ? "Adding…" : "Add habit"}</Button>
  </form>;
}
