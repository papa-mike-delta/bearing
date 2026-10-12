CREATE TABLE "habit_marks" (
	"habit_id" uuid NOT NULL,
	"day" date NOT NULL,
	CONSTRAINT "habit_marks_habit_id_day_pk" PRIMARY KEY("habit_id","day")
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habits_name_length" CHECK (char_length("habits"."name") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "habit_marks" ADD CONSTRAINT "habit_marks_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habits_user_position_idx" ON "habits" USING btree ("user_id","position","created_at");