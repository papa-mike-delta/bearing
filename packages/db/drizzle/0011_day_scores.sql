CREATE TABLE "day_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"mood" text,
	"mood_set_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_scores_mood" CHECK ("day_scores"."mood" in ('Very low', 'Low', 'Okay', 'Good', 'Very good'))
);
--> statement-breakpoint
ALTER TABLE "day_scores" ADD CONSTRAINT "day_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "day_scores_user_day_unique" ON "day_scores" USING btree ("user_id","day");