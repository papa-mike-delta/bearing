CREATE TABLE "habit_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"habit_id" uuid,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "habits_user_position_idx";--> statement-breakpoint
ALTER TABLE "habit_marks" ADD COLUMN "count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "period" text DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "track_mode" text DEFAULT 'once' NOT NULL;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "goal_count" integer;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "bad" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "habit_operations" ADD CONSTRAINT "habit_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_operations" ADD CONSTRAINT "habit_operations_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "habit_operations_operation_unique" ON "habit_operations" USING btree ("user_id","operation_id");--> statement-breakpoint
CREATE INDEX "habits_user_position_idx" ON "habits" USING btree ("user_id","period","position","created_at");--> statement-breakpoint
ALTER TABLE "habit_marks" ADD CONSTRAINT "habit_marks_count" CHECK ("habit_marks"."count" between 1 and 999);--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_period" CHECK ("habits"."period" in ('day', 'week'));--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_track_mode" CHECK ("habits"."track_mode" in ('once', 'many'));--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_goal_count" CHECK (
      ("habits"."track_mode" = 'once' and "habits"."goal_count" is null) or
      ("habits"."track_mode" = 'many' and (
        ("habits"."goal_count" is null and "habits"."bad") or
        ("habits"."goal_count" is not null and "habits"."goal_count" between 1 and
          case when "habits"."period" = 'day' then 99 else 999 end)
      ))
    );