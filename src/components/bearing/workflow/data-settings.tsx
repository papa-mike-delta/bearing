"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "../layout";
import { fieldClass, request, useWorkspace } from "./context";

export function DataSettings() {
  const { userId, mutate, refresh } = useWorkspace();
  const lock = useRef(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [confirmation, setConfirmation] = useState("");
  async function run(label: string, action: () => Promise<string>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setMessage("");
    setError("");
    try {
      setMessage(await action());
    } catch (e) {
      setError((e as Error).message || "Operation failed. Please retry.");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function maintenance(path: string, body: unknown) {
    const { outbox } = await import("@/lib/v1/outbox");
    const pending = (await outbox.listEntries(userId)).filter(
      (row) => row.status !== "synced",
    );
    if (pending.length)
      throw new Error(
        "Sync or resolve pending captures before replacing account data.",
      );
    await request(userId, path, { method: "POST", body: JSON.stringify(body) });
    await refresh();
    setConfirmation("");
  }
  return (
    <>
      <SectionCard title="Optional demo data">
        <p className="mb-3 text-sm text-muted-foreground">
          Added only when you ask, and only in this account. Edited examples stay.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              void run("Adding examples…", async () => {
                const result = await mutate<{
                  value: { alreadySeeded?: boolean };
                }>("demo", {});
                return result.value.alreadySeeded
                  ? "Demo examples are already ready in this account."
                  : "Demo examples are ready. Open Today, Journal or Library.";
              })
            }
          >
            Add demo data
          </Button>
          <Button
            variant="outline"
            disabled={!!busy}
            onClick={() => {
              if (
                window.confirm(
                  "Remove unedited demo examples from this account? Real data and other accounts are preserved.",
                )
              )
                void run("Removing examples…", async () => {
                  await mutate(
                    "demo",
                    { confirmation: "REMOVE DEMO DATA" },
                    "DELETE",
                  );
                  return "Demo examples removed. Personal data is preserved.";
                });
            }}
          >
            Remove demo data
          </Button>
        </div>
      </SectionCard>
      <SectionCard title="Backup and restore">
        <p className="mb-3 text-sm text-muted-foreground">
          A private JSON copy of this account's records, relationships, history,
          Coach conversations, preferences, and audit receipts. Passwords, 2FA,
          invitations, browser drafts, and legacy data stay out. Restore replaces
          records in this account.
        </p>
        <div className="space-y-3">
          <Button
            variant="outline"
            disabled={!!busy}
            onClick={() =>
              void run("Exporting…", async () => {
                const backup = await request(userId, "backup");
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(backup, null, 2)], {
                    type: "application/json",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = `bearing-v1-${new Date().toISOString().slice(0, 10)}.json`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                return "Backup downloaded. Pending offline captures and local drafts must be synced separately.";
              })
            }
          >
            Export V1 backup
          </Button>
          <p className="text-sm text-muted-foreground">
            Restore keeps this account&apos;s other preferences. Coach trust
            choices saved in the file stay off until you opt in again in
            Settings.
          </p>
          <label className="block text-sm">
            Backup file
            <input
              className={`${fieldClass} mt-1`}
              type="file"
              accept=".json,application/json"
              disabled={!!busy}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <label className="block text-sm">
            Confirmation
            <input
              className={`${fieldClass} mt-1`}
              value={confirmation}
              disabled={!!busy}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="RESTORE V1 DATA or RESET V1 DATA"
              autoComplete="off"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!!busy || !file || confirmation !== "RESTORE V1 DATA"}
              onClick={() =>
                void run("Restoring…", async () => {
                  if (!file || file.size > 10_000_000)
                    throw new Error(
                      "Choose a JSON backup no larger than 10 MB.",
                    );
                  const backup: unknown = JSON.parse(await file.text());
                  await maintenance("backup", { backup, confirmation });
                  return "Backup restored to this account. Coach trust stays off until you opt in again.";
                })
              }
            >
              Restore V1 backup
            </Button>
            <Button
              variant="destructive"
              disabled={!!busy || confirmation !== "RESET V1 DATA"}
              onClick={() =>
                void run("Clearing…", async () => {
                  await maintenance("reset", { confirmation });
                  return "V1 data cleared. Account identity, Me identity and audit receipts are retained.";
                })
              }
            >
              Clear V1 data
            </Button>
          </div>
        </div>
      </SectionCard>
      <p role="status" aria-live="polite">
        {busy || message}
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <a className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline decoration-border underline-offset-4" href="/help">
        Help, privacy and offline limitations
      </a>
    </>
  );
}
