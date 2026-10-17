"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { Button } from "@repo/ui/components/button";
import { MarkdownEditor } from "../../components/markdown-editor";
import { useExplicitSave } from "../../lib/use-explicit-save";
import { updateAlwaysLoadTemplate, updateJournalTemplate } from "./actions";

type Settings = { template: string; alwaysLoad: boolean };

export function JournalTemplateSettings({ settings, editing = false }: { settings: Settings; editing?: boolean }) {
  const session = useExplicitSave({
    initial: { saved: settings.template, value: settings.template },
    subject: "Journal template",
    failureMessage: "Could not save the template. Your text is kept here; please retry.",
    save: async ({ value: template }) => {
      const result = await updateJournalTemplate(template);
      if ("error" in result) return result;
      return { value: template, saved: template };
    },
  });
  const { value: template, error, dirty, edit: setTemplate, setError } = session;
  const [savingSetting, start] = useTransition();
  const pending = session.pending || savingSetting;
  const [alwaysLoad, setAlwaysLoad] = useOptimistic(settings.alwaysLoad);
  const tooLong = template.length > 10_000;
  const alwaysLoadControl = <label className="flex items-center gap-2">
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
  </label>;
  const editor = <form data-journal-editor onSubmit={(event) => {
    event.preventDefault();
    session.save();
  }}>
    <MarkdownEditor value={template} onChange={setTemplate} disabled={pending} />
    {tooLong && <p role="alert">Template exceeds 10,000 characters. Shorten it before saving; your text has not been truncated.</p>}
    <div className="flex flex-wrap items-center gap-3">
      <span role="status">{pending ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}</span>
      <Button type="submit" disabled={pending || !dirty || tooLong}>Save template</Button>
      <Link href="/journal">Back to today</Link>
    </div>
  </form>;
  if (editing) return <section className="mb-6 flex flex-col gap-3" aria-label="Journal template">
    <h2>Edit template</h2>
    {editor}
    {alwaysLoadControl}
    {error && <p role="alert">{error}</p>}
  </section>;
  return <details className="mt-6">
    <summary>Template</summary>
    <section className="mt-3 flex flex-col gap-3" aria-label="Journal template">
      <Link href="/journal?template=edit">Edit template</Link>
      {alwaysLoadControl}
      {error && <p role="alert">{error}</p>}
    </section>
  </details>;
}
