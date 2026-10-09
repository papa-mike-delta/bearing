import { sql } from "drizzle-orm";
import {
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
  // grayscale until the Account imports one theme. The six names are the
  // built-ins; "imported" paints theme_light and theme_dark for this row only.
  themeChoice: text("theme_choice").notNull().default("grayscale"),
  themeCode: text("theme_code"),
  themeLight: text("theme_light"),
  themeDark: text("theme_dark"),
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

// One Area per account in phase 1, created at sign-up (and on demand for older accounts that predate Areas).
export const areas = pgTable(
  "areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    workflow: text("workflow").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("areas_user_id_unique").on(t.userId)],
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
    completedAt: timestamp("completed_at", {
      mode: "date",
      withTimezone: true,
    }),
    source: text("source"),
    sourceId: text("source_id"),
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
