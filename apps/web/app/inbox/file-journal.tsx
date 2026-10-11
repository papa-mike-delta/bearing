"use client";

import { useState, useTransition } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Field, FieldLabel } from "@repo/ui/components/field";
import { localToday } from "../../lib/today";
import { useBrowserToday } from "../browser-today";
import { fileJournal } from "./actions";

export function FileJournal({ draftId }: { draftId: string }) {
  const today = useBrowserToday();
  const [day, setDay] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return <details className="w-full"><summary>Append to journal</summary>
    <form className="note-filing" onSubmit={(event) => {
      event.preventDefault();
      const browserToday = localToday();
      const target = day || browserToday;
      // Freeze this destination for an ambiguous failure/lost-response retry,
      // even if the browser passes midnight before the user retries.
      setDay(target);
      setError("");
      start(async () => {
        try {
          const result = await fileJournal(draftId, target, browserToday);
          if ("error" in result) setError(result.error);
          else window.location.assign(`/inbox?journalDay=${result.day}`);
        } catch { setError("Could not append. Please retry; a committed append will not add the text twice."); }
      });
    }}>
      <Field><FieldLabel htmlFor={`journal-${draftId}`}>Journal day</FieldLabel>
        <Input id={`journal-${draftId}`} type="date" min="0001-01-01" max={today ?? undefined} value={day || today || ""} onChange={(event) => setDay(event.target.value)} disabled={pending || !today} required />
      </Field>
      <p className="hint">Defaults to Today in your browser. Choose an earlier day if needed. The full draft is preserved.</p>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={pending || !today}>{pending ? "Appending…" : "Append to journal"}</Button>
    </form>
  </details>;
}
