import { z } from "zod";
import {
  id,
  instant,
  timezone,
  itemInput,
  revision,
  localDate,
} from "./contracts";
import { CORE_ITEM_TYPES } from "@/lib/redesign/contracts";
export const captureInput = z.strictObject({
  clientId: id,
  text: z
    .string()
    .max(200_000)
    .refine((text) => !!text.trim(), "Write something to capture"),
  capturedAt: instant,
  occurredAt: instant,
  timezone,
  intendedType: z.enum(CORE_ITEM_TYPES).optional(),
  mentionIds: z.array(id).max(100).optional(),
  place: z
    .strictObject({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});
export type CaptureInput = z.infer<typeof captureInput>;
export const organizeInput = z.strictObject({
  revision,
  item: itemInput.optional(),
  resolved: z.boolean().default(true),
});
export const momentEditInput = z.strictObject({
  revision,
  text: z
    .string()
    .max(200_000)
    .refine((v) => !!v.trim()),
  occurredAt: instant,
  timezone,
});
export const searchInput = z.strictObject({
  q: z.string().trim().min(1).max(200),
  kind: z
    .enum(["all", "item", "project", "journal", "review", "activity", "tag"])
    .default("all"),
  type: z.enum(CORE_ITEM_TYPES).optional(),
  areaId: id.optional(),
  projectId: id.optional(),
});
export const preferencesInput = z.strictObject({
  startup: z
    .enum(["today", "journal", "inbox", "projects", "library", "calendar"])
    .optional(),
  timezone: timezone.optional(),
  journalActivities: z.boolean().optional(),
});
export const dayInput = z.strictObject({ date: localDate.optional() });
/** Only explicit, complete shortcuts create structured records. Incomplete text stays in Inbox. */
export function captureIntent(
  text: string,
  intendedType?: CaptureInput["intendedType"],
) {
  const command = text.match(/^\s*\/(task|note|place|mood)\b\s*([\s\S]*)$/i);
  const kind = command?.[1]?.toLowerCase() ?? intendedType;
  const body = command ? command[2] : text;
  if (kind === "mood") {
    const score = body.trim().match(/^([1-5])(?:\s+(?:energy\s+)?([1-5]))?$/i);
    return score
      ? {
          kind: "check_in" as const,
          data: { mood: +score[1], ...(score[2] ? { energy: +score[2] } : {}) },
        }
      : { kind: "raw" as const };
  }
  if (kind === "task" || kind === "note" || kind === "place") {
    const title = body.trim().split("\n")[0];
    if (title && title.length <= 300)
      return {
        kind: "item" as const,
        item: {
          type: kind === "place" ? ("bookmark" as const) : kind,
          template: kind === "place" ? "place" : kind,
          title,
          content: body,
          status: "inbox" as const,
          metadata:
            kind === "place"
              ? { version: 1 as const, category: "place" as const }
              : { version: 1 as const },
        },
      };
  }
  return { kind: "raw" as const };
}
export const workflowViews = [
  "focus",
  "graph",
  "today",
  "journal",
  "inbox",
  "projects",
  "library",
  "calendar",
  "coach",
  "search",
  "settings",
  "reviews",
] as const;
