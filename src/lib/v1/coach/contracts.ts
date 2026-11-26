import { z } from "zod";
import { id, itemInput, projectInput, tagInput, revision } from "../contracts";
export const operationsInput = z
  .array(
    z.discriminatedUnion("op", [
      z.strictObject({
        op: z.literal("organize_moment"),
        key: id,
        id,
        revision,
        data: itemInput,
      }),
      z.strictObject({
        op: z.literal("create_item"),
        key: id,
        data: itemInput,
      }),
      z.strictObject({
        op: z.literal("update_item"),
        id,
        revision,
        data: z.record(z.string(), z.unknown()),
      }),
      z.strictObject({ op: z.literal("archive_item"), id, revision }),
      z.strictObject({
        op: z.literal("create_project"),
        key: id,
        data: projectInput,
      }),
      z.strictObject({
        op: z.literal("update_project"),
        id,
        revision,
        data: projectInput,
      }),
      z.strictObject({ op: z.literal("create_tag"), key: id, data: tagInput }),
      z.strictObject({
        op: z.literal("link"),
        fromId: id,
        toId: id,
        type: z.enum([
          "related_to",
          "mentions",
          "advances",
          "tracks",
          "scheduled_at",
          "located_at",
        ]),
        note: z.string().max(2000).default(""),
      }),
      z.strictObject({ op: z.literal("unlink"), id }),
    ]),
  )
  .min(1)
  .max(12);
export type Operation = z.output<typeof operationsInput>[number];
export type Source = {
  id: string;
  kind: string;
  title: string;
  href: string;
  excerpt?: string;
  revision?: number;
};
export type Plan = {
  version: 1;
  operations: Operation[];
  previews: { label: string; before: unknown; after: unknown }[];
  destructive: boolean;
};
export type Draft = {
  plan: Plan;
  token: string;
  id?: string;
  revision?: number;
  status: string;
  result?: any;
};
export type Answer = {
  text: string;
  sources: Source[];
  clarification?: { question: string; candidates: Source[]; original: string };
  drafts: Draft[];
  error?: string;
};
export const chatInput = z
  .strictObject({
    clientId: id,
    text: z.string().trim().min(1).max(4000),
    conversationId: id.optional(),
    temporary: z.boolean().default(false),
    consent: z.literal(true),
    selected: z
      .array(
        z.strictObject({
          kind: z.enum([
            "item",
            "project",
            "journal",
            "tag",
            "review",
            "activity",
            "link",
          ]),
          id,
        }),
      )
      .max(5)
      .default([]),
    history: z
      .array(
        z.strictObject({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(4000),
        }),
      )
      .max(12)
      .default([]),
  })
  .refine(
    (v) => !v.temporary || !v.conversationId,
    "Temporary chat cannot attach to a saved conversation",
  );
export type ChatInput = z.infer<typeof chatInput>;
