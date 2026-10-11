CREATE TABLE "draft_filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"destination_key" text NOT NULL,
	"kind" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"notebook_id" uuid
);
--> statement-breakpoint
ALTER TABLE "draft_filings" ADD CONSTRAINT "draft_filings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_filings_user_draft_unique" ON "draft_filings" USING btree ("user_id","draft_id");