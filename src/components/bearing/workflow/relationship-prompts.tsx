"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { validLinkEndpoints } from "@/lib/v1/link-policy";
import {
  perspectiveGaps,
  type PerspectiveGap,
  type PerspectiveScope,
} from "@/lib/v1/perspective-gaps";
import { fieldClass, useWorkspace } from "./context";
import { LinkProposalCards } from "./link-proposals";

const relations = [
  "related_to",
  "mentions",
  "advances",
  "tracks",
  "scheduled_at",
  "located_at",
];

/** Only transient form choices live here. Every result is read back from the workspace. */
export function RelationshipPrompts({
  scope,
  proposals = true,
}: {
  scope: PerspectiveScope;
  proposals?: boolean;
}) {
  const { data, mutate, proposals: inferred } = useWorkspace();
  const gaps = perspectiveGaps(data, scope, inferred);
  const [active, setActive] = useState<Pick<
    PerspectiveGap,
    "kind" | "recordId"
  > | null>(null);
  const [revision, setRevision] = useState(0);
  const [target, setTarget] = useState("");
  const [targetRevision, setTargetRevision] = useState(0);
  const [type, setType] = useState("related_to");
  const [mode, setMode] = useState("existing");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");
  const [limit, setLimit] = useState(6);
  const source =
    active?.kind === "link"
      ? data.items.find((item) => item.id === active.recordId)
      : undefined;
  const moment =
    active?.kind === "moment"
      ? data.moments.find((entry) => entry.id === active.recordId)
      : undefined;
  const project =
    active?.kind === "project"
      ? data.projects.find((entry) => entry.id === active.recordId)
      : undefined;
  // An open proposal keeps its choices if fresh inference changes the faded prompt.
  // Labels and records still come from the current canonical workspace.
  const gap =
    active &&
    ((source?.status !== "archived" && source) ||
      moment ||
      (project?.status !== "archived" && project))
      ? {
          ...active,
          title: source
            ? `Connect ${source.title}`
            : moment
              ? `Connect Journal entry: ${moment.text.slice(0, 80)}`
              : `Place a Task in ${project!.name}`,
        }
      : undefined;
  const targets = data.items.filter((item) => {
    if (item.status === "archived") return false;
    if (gap?.kind === "project")
      return item.type === "task" && item.status !== "done" && !item.projectId;
    if (source)
      return item.id !== source.id && validLinkEndpoints(type, source, item);
    return gap?.kind === "moment";
  });

  function open(next: PerspectiveGap) {
    setActive({ kind: next.kind, recordId: next.recordId });
    setRevision(
      next.kind === "moment"
        ? data.moments.find((entry) => entry.id === next.recordId)!.revision
        : data.items.find((entry) => entry.id === next.recordId)?.revision || 0,
    );
    setTarget("");
    setTargetRevision(0);
    setType("related_to");
    setMode(
      data.items.some((item) => item.status !== "archived")
        ? "existing"
        : "create",
    );
    const text =
      data.moments.find((entry) => entry.id === next.recordId)?.text || "";
    setTitle(text.trim().split("\n")[0].slice(0, 300));
    setError("");
    setReceipt("");
  }

  async function save() {
    if (!gap || busy) return;
    setBusy(true);
    setError("");
    try {
      let saved: { receiptId: string };
      if (moment && mode === "create") {
        saved = await mutate(`journal/${moment.id}/organize`, {
          revision,
          item: {
            type: "note",
            title: title.trim(),
            content: moment.text,
            status: "todo",
            timezone: moment.timezone,
            metadata: { version: 1 },
          },
        });
      } else {
        const to = targets.find((item) => item.id === target);
        if (!to) throw new Error("Choose an available Item.");
        if (source) {
          saved = await mutate("links", {
            fromId: source.id,
            toId: to.id,
            type,
            fromRevision: revision,
            toRevision: targetRevision,
          });
        } else if (moment) {
          saved = await mutate(`journal/${moment.id}/relate`, {
            revision,
            itemId: to.id,
            relation: to.type === "person" ? "mention" : "reference",
          });
        } else {
          saved = await mutate(`items/${to.id}/place`, {
            revision: targetRevision,
            projectId: gap.recordId,
          });
        }
      }
      setReceipt(saved.receiptId);
      setActive(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {proposals && <LinkProposalCards scope={scope} faded />}
      {!!gaps.length && (
        <section aria-label="Missing connections" className="space-y-2">
          {gaps.slice(0, limit).map((entry) => (
            <button
              key={entry.id}
              type="button"
              data-slot="relationship-prompt"
              className="block min-h-11 min-w-0 w-full break-words rounded-xl border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => open(entry)}
            >
              {entry.title}
            </button>
          ))}
          {gaps.length > limit && (
            <Button variant="ghost" onClick={() => setLimit(limit + 6)}>
              Show more connections
            </Button>
          )}
        </section>
      )}
      {receipt && (
        <p role="status" className="text-sm">
          Saved connection.{" "}
          <a className="underline" href={`/api/receipts/${receipt}`}>
            Open audit receipt
          </a>
        </p>
      )}
      <Dialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setActive(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="break-words">
              {gap?.title || "Connection updated"}
            </DialogTitle>
            <DialogDescription>
              Choose a connection. Nothing changes until you save.
            </DialogDescription>
          </DialogHeader>
          {!gap ? (
            <p>
              This record is no longer available. Close this prompt to review
              your current connections.
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              {source && (
                <label className="block text-sm">
                  Relationship
                  <select
                    className={fieldClass}
                    value={type}
                    disabled={busy}
                    onChange={(event) => {
                      setType(event.target.value);
                      setTarget("");
                      setTargetRevision(0);
                    }}
                  >
                    {relations.map((relation) => (
                      <option key={relation} value={relation}>
                        {relation.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {moment && (
                <label className="block text-sm">
                  Connect entry
                  <select
                    className={fieldClass}
                    value={mode}
                    disabled={busy}
                    onChange={(event) => setMode(event.target.value)}
                  >
                    <option value="existing">Use an existing Item</option>
                    <option value="create">
                      Create a Note from this entry
                    </option>
                  </select>
                </label>
              )}
              {moment && mode === "create" ? (
                <label className="block text-sm">
                  Note title
                  <input
                    className={fieldClass}
                    value={title}
                    required
                    maxLength={300}
                    disabled={busy}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
              ) : (
                <label className="block text-sm">
                  {gap.kind === "project" ? "Unassigned Task" : "Connect to"}
                  <select
                    className={fieldClass}
                    value={target}
                    required
                    disabled={busy}
                    onChange={(event) => {
                      setTarget(event.target.value);
                      setTargetRevision(
                        targets.find((item) => item.id === event.target.value)
                          ?.revision || 0,
                      );
                    }}
                  >
                    <option value="">Choose an Item</option>
                    {targets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} · {item.type}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    (moment && mode === "create" ? !title.trim() : !target)
                  }
                >
                  {busy
                    ? "Saving…"
                    : moment && mode === "create"
                      ? "Create connected Note"
                      : "Save connection"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setActive(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
