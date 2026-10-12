CREATE TABLE "entity_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_links_source_type" CHECK ("entity_links"."source_type" in ('task', 'note', 'journal')),
	CONSTRAINT "entity_links_target_type" CHECK ("entity_links"."target_type" in ('task', 'note', 'journal')),
	CONSTRAINT "entity_links_not_self" CHECK (not ("entity_links"."source_type" = "entity_links"."target_type" and "entity_links"."source_id" = "entity_links"."target_id"))
);
--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_links_edge_unique" ON "entity_links" USING btree ("user_id","source_type","source_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "entity_links_outgoing_idx" ON "entity_links" USING btree ("user_id","source_type","source_id","created_at");--> statement-breakpoint
CREATE INDEX "entity_links_incoming_idx" ON "entity_links" USING btree ("user_id","target_type","target_id","created_at");