"use client";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DraftNotice, useItemDraft } from "../item-draft-session";
import { SectionCard } from "../layout";
import { dateInZone } from "@/lib/v1/dates";
import type { ReviewRecord } from "@/lib/v1/client-model";
import { reviewInput } from "@/lib/v1/contracts";
import { fieldClass, useWorkspace } from "./context";
const prompts = [
  ["wins", "Wins", "What went well?"],
  ["challenges", "Challenges", "What felt difficult?"],
  ["learnings", "Learnings", "What will you take forward?"],
  ["gratitude", "Gratitude", "What are you grateful for?"],
  ["notes", "Notes", "Anything else on your mind?"],
] as const;
function reviewSeed(review: ReviewRecord | undefined, timezone: string) {
  const prompts = review?.prompts ?? {};
  return {
    id: review?.id,
    revision: review?.revision ?? 0,
    period: review?.period ?? "daily",
    localDate: review?.localDate ?? dateInZone(new Date(), timezone),
    wins: prompts.wins ?? "",
    challenges: prompts.challenges ?? "",
    learnings: prompts.learnings ?? "",
    gratitude: prompts.gratitude ?? "",
    notes: prompts.notes ?? "",
    priorities: Array.isArray(prompts.priorities)
      ? prompts.priorities.join("\n")
      : "",
    itemIds: review?.items?.map((item) => item.itemId) ?? [],
  };
}
export function ReviewComposer({ review }: { review?: ReviewRecord }) {
  const { data: workspace, timezone, mutate } = useWorkspace(),
    router = useRouter();
  const seed = useMemo(
    () => reviewSeed(review, timezone),
    [review, timezone],
  );
  const key = review ? `review:${review.id}` : "review:new";
  const { owner, draft, data } = useItemDraft(key, seed);
  const existing =
    review ??
    workspace.reviews.find(
      (r) => r.period === data.period && r.localDate === data.localDate,
    );
  useEffect(() => {
    if (!existing || review) return;
    if (data.id === existing.id && data.revision === (existing.revision ?? 0))
      return;
    owner.change(key, reviewSeed(existing, timezone));
  }, [existing, review, data.id, data.revision, key, owner, timezone]);
  const change = (patch: Record<string, unknown>) => owner.change(key, patch);
  async function save() {
    const ticket = owner.beginSave(key);
    if (!ticket) return;
    try {
      const value = ticket.data;
      const input = reviewInput.parse({
        period: value.period,
        localDate: value.localDate,
        timezone,
        prompts: {
          ...Object.fromEntries(prompts.map(([name]) => [name, value[name]])),
          priorities: String(value.priorities)
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        itemIds: value.itemIds,
      });
      const result = existing
        ? await mutate(
            `reviews/${existing.id}`,
            { revision: existing.revision ?? 0, data: input },
            "PUT",
          )
        : await mutate("reviews", input);
      owner.completeTransient(ticket, seed);
      if (!review) router.push(`/app/reviews/${result.value.id}`);
    } catch (error) {
      owner.fail(ticket, error);
    }
  }
  return (
    <SectionCard title="Write a reflection">
      <p className="mb-4 text-sm text-muted-foreground">
        A Review is separate from Journal moments and mood check-ins. Choose a
        date to label the period you are reflecting on. One Review per period
        and date.
      </p>
      <DraftNotice draft={draft} onDiscard={() => owner.discard(key)} />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Review period
            <select
              className={fieldClass}
              value={data.period}
              onChange={(e) => change({ period: e.target.value })}
            >
              {["daily", "weekly", "monthly"].map((period) => (
                <option key={period} value={period}>
                  {period}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Review date
            <input
              className={fieldClass}
              type="date"
              required
              value={data.localDate}
              onChange={(e) => change({ localDate: e.target.value })}
            />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {prompts.map(([name, label, placeholder]) => (
            <label
              className={`block text-sm ${name === "notes" ? "md:col-span-2" : ""}`}
              key={name}
            >
              {label}
              <textarea
                className={`${fieldClass} mt-1 min-h-24`}
                aria-label={label}
                value={data[name]}
                placeholder={placeholder}
                onChange={(e) => change({ [name]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <label className="block text-sm">
          Priorities · one per line
          <textarea
            className={`${fieldClass} mt-1 min-h-24`}
            value={data.priorities}
            onChange={(e) => change({ priorities: e.target.value })}
          />
        </label>
        <fieldset>
          <legend className="text-sm">Related Items (optional)</legend>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {workspace.items.map((item) => (
              <label
                key={item.id}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={data.itemIds.includes(item.id)}
                  onChange={(e) =>
                    change({
                      itemIds: e.target.checked
                        ? [...data.itemIds, item.id]
                        : data.itemIds.filter((id: string) => id !== item.id),
                    })
                  }
                />
                {item.title}
              </label>
            ))}
          </div>
        </fieldset>
        {existing && !review && (
          <p role="status" className="text-sm">
            This period already has a reflection. The form opens it.{" "}
            <Link className="underline" href={`/app/reviews/${existing.id}`}>
              Read saved Review
            </Link>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!!draft?.pending}>
            {draft?.pending
              ? "Saving reflection…"
              : existing
                ? "Update reflection"
                : "Save reflection"}
          </Button>
          {existing && (
            <Button
              type="button"
              variant="destructive"
              disabled={!!draft?.pending}
              onClick={() => {
                if (!window.confirm("Delete this reflection?")) return;
                void mutate(
                  `reviews/${existing.id}`,
                  { revision: existing.revision ?? 0 },
                  "DELETE",
                ).then(() => {
                  if (!review) router.push("/app/reviews");
                });
              }}
            >
              Delete reflection
            </Button>
          )}
        </div>
      </form>
    </SectionCard>
  );
}
