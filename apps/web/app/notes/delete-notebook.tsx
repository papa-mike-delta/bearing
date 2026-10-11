"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/button";
import { removeNotebook } from "./actions";

export function DeleteNotebook({ notebookId, noteCount }: { notebookId: string; noteCount: number }) {
  const [choose, setChoose] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function remove(mode: "delete-notes" | "move-notes") {
    start(async () => {
      setError("");
      try {
        const result = await removeNotebook(notebookId, mode);
        if ("error" in result) setError(result.error);
        else router.push(result.href);
      } catch { setError("Could not delete. Please try again."); }
    });
  }

  if (choose) return <div className="panel mt-6 flex flex-col gap-3">
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={pending} onClick={() => remove("move-notes")}>Move {noteCount} notes to No notebook</Button>
      <Button type="button" variant="destructive" disabled={pending} onClick={() => remove("delete-notes")}>Delete notebook and all {noteCount} notes</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={() => { setError(""); setChoose(false); }}>Cancel</Button>
    </div>
  </div>;

  return <div className="mt-6">
    {error && <p role="alert">{error}</p>}
    <Button type="button" variant="destructive" disabled={pending} onClick={() => {
      if (noteCount > 0) { setError(""); setChoose(true); return; }
      if (!window.confirm("Delete this notebook?")) return;
      remove("delete-notes");
    }}>Delete notebook</Button>
  </div>;
}
