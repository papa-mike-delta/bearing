"use client";
import { TaskRecurrence } from "./recurrence";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { DraftNotice, useItemDraft } from "../item-draft-session";
import { useOpenItem } from "@/hooks/use-open-item";
import { StructuredFields, newItemSeed, typeNames } from "./structured-fields";
import type { CanonicalItem } from "@/lib/v1/contracts";
import { itemInput } from "@/lib/v1/contracts";
import {
  itemDto,
  itemSeed,
  statusNames,
  type ItemRecord,
} from "@/lib/v1/client-model";
import {
  markdownTasks,
  toggleMarkdownTask,
  localDateTime,
  instantFromInput,
} from "@/lib/v1/workflow-dates";
import { useWorkspace, fieldClass } from "./context";
const RichTextEditor = dynamic(
  () => import("../rich-text-editor").then((m) => m.RichTextEditor),
  { ssr: false },
);
export function TagSelector({
  selected,
  onChange,
}: {
  selected: string[];
  onChange(ids: string[]): void;
}) {
  const { data } = useWorkspace();
  return (
    <div className="space-y-2">
      {["area", "tag"].map((kind) => (
        <fieldset key={kind}>
          <legend className="text-xs font-semibold">
            {kind === "area" ? "Direct Areas" : "Tags"}
          </legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {data.tags
              .filter((t) => t.kind === kind)
              .map((tag) => (
                <label
                  key={tag.id}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(tag.id)}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...selected, tag.id]
                          : selected.filter((id) => id !== tag.id),
                      )
                    }
                  />
                  {tag.name}
                </label>
              ))}
            {!data.tags.some((t) => t.kind === kind) && (
              <span className="text-xs text-muted-foreground">
                None yet. Create {kind === "area" ? "Areas" : "Tags"} in
                Settings.
              </span>
            )}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
export function ItemEditor({
  item,
  draftKey,
  type = "task",
}: {
  item?: ItemRecord;
  draftKey?: string;
  type?: CanonicalItem["type"];
}) {
  const { userId, data: workspace, timezone, mutate, refresh } = useWorkspace(),
    router = useRouter();
  const seed = useMemo(
    () => (item ? itemSeed(item) : newItemSeed(type, timezone)),
    [item, type, timezone],
  );
  const { owner, draft, data } = useItemDraft(
    item ? `item:${item.id}` : (draftKey ?? null),
    seed,
  );
  useOpenItem(item?.id, userId);
  const [rich, setRich] = useState(false),
    [actionError, setActionError] = useState("");
  const promotions = useRef<Record<number, string>>({});
  const key = item ? `item:${item.id}` : draftKey;
  async function save() {
    if (!key) return;
    const ticket = owner.beginSave(key);
    if (!ticket) return;
    try {
      const value = itemInput.parse(itemDto(ticket.data));
      const result = await mutate(
        item ? `items/${item.id}` : "items",
        item ? { revision: ticket.data.revision, data: value } : value,
        item ? "PUT" : "POST",
      );
      owner.complete(ticket, itemSeed(result.value));
      if (!item) router.replace(`/app/library/${result.value.id}`);
    } catch (error) {
      owner.fail(ticket, error);
      await refresh();
    }
  }
  const project = workspace.projects.find((p) => p.id === data.projectId);
  const change = (patch: Record<string, any>) => {
    if (key) owner.change(key, patch);
  };
  const tasks = markdownTasks(data.content || "");
  async function promote(line: number) {
    if (!item || draft?.dirtyFields.length) return;
    setActionError("");
    const clientId = (promotions.current[line] ??= crypto.randomUUID());
    try {
      await mutate(`items/${item.id}/promote`, {
        revision: item.revision,
        line,
        clientId,
      });
      await refresh();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not promote this step",
      );
    }
  }
  return (
    <div className="space-y-5">
      <DraftNotice draft={draft} onDiscard={() => key && owner.discard(key)} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="block text-sm font-medium">
          Title
          <input
            required
            className={`${fieldClass} mt-1`}
            value={data.title}
            onChange={(e) => change({ title: e.target.value })}
          />
        </label>
        <StructuredFields
          data={data}
          change={change}
          onError={setActionError}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Status
            <select
              className={`${fieldClass} mt-1`}
              value={data.status}
              onChange={(e) => change({ status: e.target.value })}
            >
              {Object.entries(statusNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Priority
            <select
              className={`${fieldClass} mt-1`}
              value={data.priority}
              onChange={(e) => change({ priority: +e.target.value })}
            >
              {[-2, -1, 0, 1, 2].map((n) => (
                <option key={n} value={n}>
                  {n > 0 ? `+${n}` : n} ·{" "}
                  {
                    (
                      {
                        "-2": "Lowest",
                        "-1": "Low",
                        "0": "Normal",
                        "1": "High",
                        "2": "Highest",
                      } as Record<string, string>
                    )[n]
                  }
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          Primary Project
          <select
            className={`${fieldClass} mt-1`}
            value={data.projectId || ""}
            onChange={(e) => change({ projectId: e.target.value || null })}
          >
            <option value="">No Project</option>
            {workspace.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <TagSelector
          selected={data.tagIds || []}
          onChange={(tagIds) => change({ tagIds })}
        />
        {!!project?.tags.some((t) => t.tag.kind === "area") && (
          <p className="text-xs text-muted-foreground">
            Inherited from {project.name}:{" "}
            {project.tags
              .filter((t) => t.tag.kind === "area")
              .map((t) => t.tag.name)
              .join(", ")}
            . These Areas are not copied onto this Item.
          </p>
        )}
        {data.type === "task" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Due date
              <input
                type="date"
                className={`${fieldClass} mt-1`}
                value={data.localDate || ""}
                onChange={(e) =>
                  change({ localDate: e.target.value || null, dueAt: null })
                }
              />
            </label>
            <label className="text-sm">
              Scheduled work · {timezone}
              <input
                type="datetime-local"
                className={`${fieldClass} mt-1`}
                value={
                  data.scheduledAt
                    ? localDateTime(data.scheduledAt, timezone)
                    : ""
                }
                onChange={(e) => {
                  try {
                    change({
                      scheduledAt: e.target.value
                        ? instantFromInput(e.target.value, timezone)
                        : null,
                    });
                    setActionError("");
                  } catch (err) {
                    setActionError((err as Error).message);
                  }
                }}
              />
            </label>
          </div>
        )}
        {data.delegateId && (
          <p className="text-xs">
            Delegated to{" "}
            {workspace.items.find((i) => i.id === data.delegateId)?.title ||
              "Person"}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="item-content" className="text-sm font-medium">
            Content
          </label>
          <Button
            type="button"
            variant="ghost"
            aria-pressed={rich}
            onClick={() => setRich(!rich)}
          >
            {rich ? "Markdown source" : "Rich text"}
          </Button>
        </div>
        {rich ? (
          <RichTextEditor
            value={data.content}
            onChange={(content) => change({ content })}
          />
        ) : (
          <textarea
            id="item-content"
            rows={9}
            className={fieldClass}
            value={data.content}
            onChange={(e) => change({ content: e.target.value })}
          />
        )}
        {!!tasks.length && (
          <fieldset className="space-y-2 rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-medium">
              {data.type === "habit"
                ? "Checklist template · occurrence ticks are below"
                : "Checklist · save to keep changes"}
            </legend>
            {tasks.map((task) => (
              <div
                key={task.index}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <label className="inline-flex min-h-11 flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={task.checked}
                    disabled={data.type === "habit"}
                    onChange={(e) =>
                      change({
                        content: toggleMarkdownTask(
                          data.content,
                          task.index,
                          e.target.checked,
                        ),
                      })
                    }
                  />
                  {task.text}
                </label>
                {item?.type === "task" && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!!draft?.dirtyFields.length || !!draft?.pending}
                    onClick={() => void promote(task.index)}
                  >
                    Promote to Task
                  </Button>
                )}
              </div>
            ))}
          </fieldset>
        )}
        {actionError && (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        )}
        <Button
          type="submit"
          disabled={!draft || !!draft.pending || !data.title.trim()}
        >
          {draft?.pending
            ? "Saving…"
            : item
              ? "Save changes"
              : `Create ${typeNames[type]}`}
        </Button>
      </form>
      {item?.type === "task" && <TaskRecurrence item={item} unsaved={!!draft?.dirtyFields.length || !!draft?.pending} />}
      {item && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm">
            Read formatted content
          </summary>
          <div className="prose prose-sm max-w-none break-words dark:prose-invert">
            <ReactMarkdown>{item.content}</ReactMarkdown>
          </div>
        </details>
      )}
    </div>
  );
}
