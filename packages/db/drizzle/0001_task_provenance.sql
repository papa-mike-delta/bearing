ALTER TABLE "tasks" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_area_source_unique" ON "tasks" USING btree ("area_id","source","source_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_pair" CHECK (("tasks"."source" is null) = ("tasks"."source_id" is null));