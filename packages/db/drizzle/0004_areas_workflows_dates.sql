-- Many Areas per account. The previous deployment's sign-up used ON CONFLICT
-- on areas_user_id_unique, so account creation can fail until the new code
-- is the one serving. New columns keep their defaults so a task insert from
-- that deployment still succeeds.
DROP INDEX "areas_user_id_unique";--> statement-breakpoint
ALTER TABLE "areas" ADD COLUMN "wip_limit" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status" text DEFAULT 'later' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "previous_status" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "age" date DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_on" date;--> statement-breakpoint
-- Rows that already existed: open Tasks are later, a completion time stays
-- completed, and age is the UTC calendar day of created_at. Defaults above
-- cover rows the previous deployment inserts during this migration's window.
UPDATE "tasks" SET "status" = 'completed' WHERE "completed_at" IS NOT NULL;--> statement-breakpoint
UPDATE "tasks" SET "age" = ("created_at" AT TIME ZONE 'UTC')::date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hidden_area_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "areas_user_name_unique" ON "areas" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_wip_limit_min" CHECK ("areas"."wip_limit" >= 1);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status" CHECK ("tasks"."status" in ('later', 'next', 'started', 'waiting', 'completed'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_previous_status" CHECK ("tasks"."previous_status" is null or "tasks"."previous_status" in ('later', 'next', 'started', 'waiting', 'completed'));