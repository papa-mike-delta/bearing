"use client";

import { useRef, useState, useTransition } from "react";
import { Angry, Frown, Meh, Smile, Laugh } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { moods, type Mood } from "../../lib/mood-values";
import type { MoodInput } from "../../lib/mood";
import { localToday } from "../../lib/today";
import { updateMood } from "./actions";

const faces = [Angry, Frown, Meh, Smile, Laugh];

export function MoodControl({ day, initialMood }: { day: string; initialMood: Mood | null }) {
  const [mood, setMood] = useState(initialMood);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<MoodInput | null>(null);
  const [pending, start] = useTransition();
  const lastIssued = useRef(0);

  function save(input: MoodInput) {
    start(async () => {
      setError("");
      setRetry(null);
      try {
        const result = await updateMood(input);
        if ("error" in result) { setError(result.error); setRetry(input); }
        else {
          setMood(result.mood);
          lastIssued.current = Math.max(lastIssued.current, result.setAt);
        }
      } catch {
        setError("Could not save the mood. Please retry.");
        // A lost response must replay the original timestamp, even if a newer
        // choice was saved in another tab before this retry reaches the server.
        setRetry(input);
      }
    });
  }

  function choose(value: Mood | null) {
    const setAt = Math.max(Date.now(), lastIssued.current + 1);
    lastIssued.current = setAt;
    save({ day, today: localToday(), mood: value, setAt });
  }

  return <section aria-labelledby="mood-heading" className="mb-6">
    <h2 id="mood-heading" className="mb-3">Mood for the day</h2>
    <div role="group" aria-label="Mood for the day" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {moods.map((word, index) => {
        const Face = faces[index]!;
        return <Button key={word} type="button" variant="outline" data-mood={word}
          className="mood-choice h-auto flex-col gap-2 px-2 py-3 text-sm"
          aria-pressed={mood === word} disabled={pending} onClick={() => choose(word)}>
          <Face className="size-12" aria-hidden="true" />
          <span>{word}</span>
        </Button>;
      })}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" disabled={pending || mood === null} onClick={() => choose(null)}>Clear</Button>
      <span role="status">{pending ? "Saving mood…" : mood === null ? "No mood set" : `Mood: ${mood}`}</span>
      {retry && <Button type="button" variant="outline" disabled={pending} onClick={() => save(retry)}>Retry mood</Button>}
    </div>
    {error && <p role="alert" className="mt-2">{error}</p>}
  </section>;
}
