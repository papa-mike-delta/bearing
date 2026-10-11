import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// The user row is the account. Auth.js reads name, emailVerified, and image;
// they stay empty because sign-in is email and password only.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  emailVerified: timestamp("email_verified", {
    mode: "date",
    withTimezone: true,
  }),
  image: text("image"),
  // One of the six built-in ids, e.g. old-gold, or imported. Grayscale until a
  // choice. Choosing a built-in does not clear an import's code and variables.
  themeChoice: text("theme_choice").notNull().default("grayscale"),
  themeCode: text("theme_code"),
  themeLight: text("theme_light"),
  themeDark: text("theme_dark"),
  // Area ids the person has hidden. An Area not in this set is visible.
  hiddenAreaIds: uuid("hidden_area_ids")
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Auth.js database sessions. The session cookie holds sessionToken.
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

// An account has many Areas. A new account has none; nothing is seeded.
export const areas = pgTable(
  "areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    workflow: text("workflow").notNull(),
    wipLimit: integer("wip_limit").notNull().default(3),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("areas_user_name_unique").on(t.userId, sql`lower(${t.name})`),
    check("areas_wip_limit_min", sql`${t.wipLimit} >= 1`),
  ],
);

// A folder inside one Area. Deleting it clears the Task's Goal and keeps the Task.
export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("goals_area_name_unique").on(t.areaId, sql`lower(${t.name})`),
  ],
);

// A task is open until completedAt is set. source and sourceId record where it
// came from (e.g. the Coach and its tool-call id); both are null for Tasks
// added on the list or filed from a Draft.
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    areaId: uuid("area_id")
      .notNull()
      .references(() => areas.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    note: text("note").notNull().default(""),
    priority: integer("priority").notNull(),
    // later, next, started, waiting, or completed. Open rows from before
    // statuses existed are later; a completion time means completed.
    status: text("status").notNull().default("later"),
    previousStatus: text("previous_status"),
    // The calendar day age is counted from. New rows use the browser's day.
    age: date("age").notNull().default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`),
    // A reminder day, strictly after the day it was set. Null until scheduled.
    scheduledOn: date("scheduled_on"),
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    source: text("source"),
    sourceId: text("source_id"),
    goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Same scale as minPriority..maxPriority in @repo/domain.
    check("tasks_priority_range", sql`${t.priority} between -2 and 2`),
    check(
      "tasks_status",
      sql`${t.status} in ('later', 'next', 'started', 'waiting', 'completed')`,
    ),
    check(
      "tasks_previous_status",
      sql`${t.previousStatus} is null or ${t.previousStatus} in ('later', 'next', 'started', 'waiting', 'completed')`,
    ),
    check(
      "tasks_source_pair",
      sql`(${t.source} is null) = (${t.sourceId} is null)`,
    ),
    // One Task per source and source id in an Area. Nulls never collide.
    uniqueIndex("tasks_area_source_unique").on(t.areaId, t.source, t.sourceId),
  ],
);

// Captured text. It stays in the inbox until filed, then moves to archive.
export const drafts = pgTable("drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  workspace: text("workspace").notNull().default("inbox"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const notebooks = pgTable("notebooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notebookId: uuid("notebook_id").references(() => notebooks.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("notes_user_notebook_idx").on(t.userId, t.notebookId)],
);

// No Note foreign key: a deleted result must never allow an old operation to recreate it.
export const noteOperations = pgTable("note_operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  source: text("source").notNull(),
  sourceId: text("source_id").notNull(),
  noteId: uuid("note_id").notNull(),
}, (t) => [uniqueIndex("note_operations_source_unique").on(t.userId, t.source, t.sourceId)]);

// One markdown document per owned calendar day. Merely viewing a day creates nothing.
export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  body: text("body").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [uniqueIndex("journal_entries_user_day_unique").on(t.userId, t.day)]);

// A mood belongs to the day independently of its optional journal document.
// Keep clears as null with their set time so old replays cannot restore a mood.
export const dayScores = pgTable("day_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  mood: text("mood"),
  moodSetAt: timestamp("mood_set_at", { mode: "date", withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("day_scores_user_day_unique").on(t.userId, t.day),
  check("day_scores_mood", sql`${t.mood} in ('Very low', 'Low', 'Okay', 'Good', 'Very good')`),
]);

// Account defaults are created only by an explicit settings change.
export const journalSettings = pgTable("journal_settings", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  template: text("template"),
  alwaysLoad: boolean("always_load").notNull().default(false),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Durable append receipts live apart from editable bodies. No entry FK: removing
// a result must never let an old operation recreate or append it again.
export const journalOperations = pgTable("journal_operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  operationId: text("operation_id").notNull(),
  source: text("source").notNull(),
  day: date("day").notNull(),
  payloadHash: text("payload_hash").notNull(),
  entryId: uuid("entry_id").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("journal_operations_source_unique").on(t.userId, t.source, t.operationId)]);

// Coach threads. Phase 2 opens one per person, but nothing stops more.
export const coachThreads = pgTable(
  "coach_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("coach_threads_user_id_idx").on(t.userId)],
);

// One row per AI SDK UI message. id is the message's own uuid, and parts is
// its parts array, so a saved thread reloads as the messages useChat sent.
export const coachMessages = pgTable(
  "coach_messages",
  {
    id: uuid("id").primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => coachThreads.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    parts: jsonb("parts_json").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("coach_messages_role", sql`${t.role} in ('user', 'assistant')`),
    index("coach_messages_thread_created_idx").on(t.threadId, t.createdAt),
  ],
);
