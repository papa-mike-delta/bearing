/** Canonical DTOs: import in UI, HTTP adapters and Coach; no database dependencies. */
import { z } from "zod";
import {
  CORE_ITEM_TYPES,
  TASK_STATUSES,
  NOTE_TEMPLATES,
  HABIT_TEMPLATES,
  BOOKMARK_CATEGORIES,
  REVIEW_PERIODS,
} from "@/lib/redesign/contracts";

export const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const instant = z.iso.datetime({ offset: true });
export const localDate = z.iso.date();
export const timezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Invalid IANA timezone");
const text = z.string().max(200_000);
const label = z.string().trim().min(1).max(300);
const url = z
  .url()
  .refine(
    (v) => ["http:", "https:"].includes(new URL(v).protocol),
    "Only HTTP(S) references are supported",
  );
const version = z.literal(1).default(1);
const noteMeta = z.strictObject({ version, summary: text.optional() });
const taskMeta = z.strictObject({
  version,
  quantity: z.number().finite().nonnegative().optional(),
  unit: z.string().max(80).optional(),
});
const habitMeta = z.strictObject({
  version,
  cadence: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  quantity: z.number().finite().nonnegative().optional(),
  unit: z.string().max(80).optional(),
});
const personMeta = z.strictObject({
  version,
  email: z.email().optional(),
  phone: z.string().max(100).optional(),
  birthday: localDate.optional(),
  relationship: z.string().max(100).optional(),
  importantDates: z
    .array(z.strictObject({ label, date: localDate }))
    .max(100)
    .default([]),
});
const bookmarkMeta = z.discriminatedUnion("category", [
  z.strictObject({
    version,
    category: z.literal("media"),
    format: label,
    creator: label.optional(),
    url: url.optional(),
  }),
  z
    .strictObject({
      version,
      category: z.literal("place"),
      address: text.optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      url: url.optional(),
      capturedMomentId: id.optional(),
    })
    .refine(
      (m) => (m.latitude === undefined) === (m.longitude === undefined),
      "Coordinates require latitude and longitude",
    ),
  z.strictObject({ version, category: z.literal("web"), url }),
  z.strictObject({
    version,
    category: z.literal("file"),
    reference: label,
    url: url.optional(),
  }),
]);
export const metadataSchemas = {
  task: taskMeta,
  note: noteMeta,
  habit: habitMeta,
  person: personMeta,
  event: z.strictObject({ version, location: text.optional() }),
  goal: z.strictObject({ version, outcome: text.optional() }),
  bookmark: bookmarkMeta,
} as const;
export const templates = {
  task: ["task", "milestone", "checklist"],
  note: NOTE_TEMPLATES,
  habit: HABIT_TEMPLATES,
  event: ["event", "appointment", "meeting", "occasion"],
  goal: ["goal"],
  person: ["person"],
  bookmark: BOOKMARK_CATEGORIES,
} as const;
export const itemInput = z
  .strictObject({
    type: z.enum(CORE_ITEM_TYPES),
    template: z.string().optional(),
    title: label,
    content: text.default(""),
    status: z.enum(TASK_STATUSES).default("inbox"),
    priority: z.number().int().min(-2).max(2).default(0),
    projectId: id.nullable().default(null),
    delegateId: id.nullable().default(null),
    tagIds: z.array(id).max(100).default([]),
    dueAt: instant.nullable().default(null),
    scheduledAt: instant.nullable().default(null),
    startAt: instant.nullable().default(null),
    endAt: instant.nullable().default(null),
    followUpAt: instant.nullable().default(null),
    localDate: localDate.nullable().default(null),
    timezone: timezone.default("UTC"),
    metadata: z.unknown().default({ version: 1 }),
  })
  .transform((value, ctx) => {
    const template =
      value.template ?? (value.type === "bookmark" ? "web" : value.type);
    if (!(templates[value.type] as readonly string[]).includes(template))
      ctx.addIssue({
        code: "custom",
        message: "Invalid template for Item type",
        path: ["template"],
      });
    const meta = metadataSchemas[value.type].safeParse(value.metadata);
    if (!meta.success)
      for (const issue of meta.error.issues)
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: ["metadata", ...issue.path],
        });
    if (
      value.type === "bookmark" &&
      meta.success &&
      "category" in meta.data &&
      meta.data.category !== template
    )
      ctx.addIssue({
        code: "custom",
        message: "Bookmark template must match category",
      });
    if (value.type !== "task" && value.delegateId)
      ctx.addIssue({ code: "custom", message: "Only Tasks may be delegated" });
    if (value.type !== "event" && (value.startAt || value.endAt))
      ctx.addIssue({
        code: "custom",
        message: "Event start/end belong to Events",
      });
    if (
      value.type === "event" &&
      (!value.startAt ||
        !value.endAt ||
        Date.parse(value.endAt) < Date.parse(value.startAt))
    )
      ctx.addIssue({
        code: "custom",
        message: "Events require an ordered start and end",
      });
    return {
      ...value,
      template,
      metadata: meta.success ? meta.data : { version: 1 },
    };
  });
export type ItemInput = z.input<typeof itemInput>;
export type CanonicalItem = z.output<typeof itemInput>;
export const projectInput = z.strictObject({
  name: label,
  description: text.default(""),
  status: z
    .enum(["active", "paused", "completed", "archived"])
    .default("active"),
  tagIds: z.array(id).max(100).default([]),
});
export const tagInput = z.strictObject({
  name: label,
  kind: z.enum(["tag", "area"]).default("tag"),
});
export const momentInput = z.strictObject({
  clientId: id,
  text: text.refine(
    (value) => value.trim().length > 0,
    "Text must not be blank",
  ),
  occurredAt: instant,
  timezone,
  intendedType: z.enum(CORE_ITEM_TYPES).optional(),
  needsOrganization: z.boolean().default(true),
  items: z
    .array(
      z.strictObject({
        itemId: id,
        relation: z.enum(["mention", "reference"]).default("mention"),
      }),
    )
    .max(100)
    .default([]),
});
const activityBase = {
  clientId: id,
  occurredAt: instant,
  timezone,
  itemId: id.nullable().default(null),
};
export const activityInput = z.discriminatedUnion("kind", [
  z.strictObject({
    ...activityBase,
    kind: z.literal("check_in"),
    data: z
      .strictObject({
        mood: z.number().int().min(1).max(5).optional(),
        energy: z.number().int().min(1).max(5).optional(),
      })
      .refine((d) => d.mood !== undefined || d.energy !== undefined),
  }),
  z.strictObject({
    ...activityBase,
    kind: z.literal("habit_completion"),
    itemId: id,
    data: z.strictObject({
      value: z.number().finite().nonnegative().default(1),
      checklist: z.array(z.boolean()).max(500).default([]),
      content: text.optional(),
      period: z.string().max(10).optional(),
    }),
  }),
  z.strictObject({
    ...activityBase,
    kind: z.literal("focus"),
    data: z.strictObject({ minutes: z.number().int().min(1).max(1440) }),
  }),
  z.strictObject({
    ...activityBase,
    kind: z.literal("observation"),
    data: z.strictObject({
      text: text.refine(
        (value) => value.trim().length > 0,
        "Text must not be blank",
      ),
    }),
  }),
  z.strictObject({
    ...activityBase,
    kind: z.literal("interaction"),
    itemId: id,
    data: z.strictObject({ note: text }),
  }),
  z.strictObject({
    ...activityBase,
    kind: z.literal("task_completion"),
    itemId: id,
    data: z.strictObject({}),
  }),
]);
export const reviewInput = z.strictObject({
  period: z.enum(REVIEW_PERIODS),
  localDate,
  timezone,
  prompts: z.strictObject({
    wins: text.optional(),
    challenges: text.optional(),
    learnings: text.optional(),
    gratitude: text.optional(),
    notes: text.optional(),
    priorities: z.array(label).max(100).default([]),
  }),
  itemIds: z.array(id).max(100).default([]),
});
export const linkInput = z
  .strictObject({
    fromId: id,
    toId: id,
    type: z.enum([
      "advances",
      "tracks",
      "related_to",
      "mentions",
      "scheduled_at",
      "located_at",
    ]),
    note: text.default(""),
    fromRevision: z.number().int().nonnegative().optional(),
    toRevision: z.number().int().nonnegative().optional(),
  })
  .refine((v) => v.fromId !== v.toId, "Self Links are not supported");
export const recurrenceRule = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("calendar"),
    unit: z.enum(["day", "week", "month"]),
    interval: z.number().int().min(1).max(365),
    timezone,
    localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  }),
  z.strictObject({
    mode: z.literal("completion"),
    unit: z.enum(["day", "week", "month"]),
    interval: z.number().int().min(1).max(365),
    timezone,
  }),
]);
export const revision = z.number().int().nonnegative();
export const invitationInput = z.strictObject({
  email: z.email().transform((s) => s.toLowerCase()),
  token: z.string().min(32).max(200),
  password: z.string().min(8).max(200),
  name: label.optional(),
});
