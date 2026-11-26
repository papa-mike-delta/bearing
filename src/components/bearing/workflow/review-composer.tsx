"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DraftNotice, useItemDraft } from "../item-draft-session";
import { SectionCard } from "../layout";
import { dateInZone } from "@/lib/v1/dates";
import { reviewInput } from "@/lib/v1/contracts";
import { fieldClass, useWorkspace } from "./context";
const prompts = [
  ["wins", "Wins", "What went well?"],
  ["challenges", "Challenges", "What felt difficult?"],
  ["learnings", "Learnings", "What will you take forward?"],
  ["gratitude", "Gratitude", "What are you grateful for?"],
  ["notes", "Notes", "Anything else on your mind?"],
] as const;
export function ReviewComposer() {
  const { data: workspace, timezone, mutate } = useWorkspace(),
    router = useRouter();
  const seed = useMemo(
    () => ({
      period: "daily",
      localDate: dateInZone(new Date(), timezone),
      wins: "",
      challenges: "",
      learnings: "",
      gratitude: "",
      notes: "",
      priorities: "",
      itemIds: [] as string[],
    }),
    [timezone],
  );
  const key = "review:new";
  const { owner, draft, data } = useItemDraft(key, seed);
  const existing = workspace.reviews.find(
    (r) => r.period === data.period && r.localDate === data.localDate,
  );
  const change = (patch: Record<string, unknown>) => owner.change(key, patch);
  async function save() {
    if (existing) return;
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
      const result = await mutate("reviews", input);
      owner.completeTransient(ticket, seed);
      router.push(`/app/reviews/${result.value.id}`);
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
        {existing && (
          <p role="status" className="text-sm">
            A Review already exists for this period and date.{" "}
            <Link className="underline" href={`/app/reviews/${existing.id}`}>
              Read saved Review
            </Link>
          </p>
        )}
        <Button disabled={!!draft?.pending || !!existing}>
          {draft?.pending ? "Saving reflection…" : "Save reflection"}
        </Button>
      </form>
    </SectionCard>
  );
}
