"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@repo/ui/components/button";
import { MarkdownEditor } from "../../components/markdown-editor";
import { useUnsavedChanges } from "../../components/use-unsaved-changes";
import { updateAlwaysLoadTemplate, updateJournalTemplate } from "./actions";

type Settings = { template: string; alwaysLoad: boolean };

export function JournalTemplateSettings({ settings, editing = false }: { settings: Settings; editing?: boolean }) {
  const [saved, setSaved] = useState(settings.template);
  const [template, setTemplate] = useState(saved);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [alwaysLoad, setAlwaysLoad] = useOptimistic(settings.alwaysLoad);
  const dirty = template !== saved;
  useUnsavedChanges(dirty, "Journal template");
  const tooLong = template.length > 10_000;
  return <section className="mb-6 flex flex-col gap-3" aria-label="Journal template">
    {editing ? <>
      <h2>Edit template</h2>
      <form data-journal-editor onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          setError("");
          try {
            const result = await updateJournalTemplate(template);
            if ("error" in result) setError(result.error);
            else setSaved(template);
          } catch { setError("Could not save the template. Your text is kept here; please retry."); }
        });
      }}>
        <MarkdownEditor value={template} onChange={setTemplate} disabled={pending} />
        {tooLong && <p role="alert">Template exceeds 10,000 characters. Shorten it before saving; your text has not been truncated.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <span role="status">{pending ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
          <Button type="submit" disabled={pending || !dirty || tooLong}>Save template</Button>
          <Link href="/journal">Back to today</Link>
        </div>
      </form>
    </> : <Link href="/journal?template=edit">Edit template</Link>}
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={alwaysLoad} disabled={pending} onChange={(event) => {
        const checked = event.target.checked;
        start(async () => {
          setAlwaysLoad(checked);
          setError("");
          try {
            const result = await updateAlwaysLoadTemplate(checked);
            if ("error" in result) setError(result.error);
          } catch { setError("Could not save the setting. Please retry."); }
        });
      }} />Always load template
    </label>
    {error && <p role="alert">{error}</p>}
  </section>;
}
