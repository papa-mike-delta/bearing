ALTER TABLE "entity_links" DROP CONSTRAINT "entity_links_source_type";--> statement-breakpoint
ALTER TABLE "entity_links" DROP CONSTRAINT "entity_links_target_type";--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_source_type" CHECK ("entity_links"."source_type" in ('task', 'note', 'journal', 'person'));--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_target_type" CHECK ("entity_links"."target_type" in ('task', 'note', 'journal', 'person'));