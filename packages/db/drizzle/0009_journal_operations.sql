CREATE TABLE "journal_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"source" text NOT NULL,
	"day" date NOT NULL,
	"payload_hash" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_operations" ADD CONSTRAINT "journal_operations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_operations_source_unique" ON "journal_operations" USING btree ("user_id","source","operation_id");