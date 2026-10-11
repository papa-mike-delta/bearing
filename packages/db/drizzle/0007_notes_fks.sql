ALTER TABLE "notes" ALTER COLUMN "notebook_id" DROP NOT NULL;--> statement-breakpoint
DELETE FROM "notes" WHERE "user_id" NOT IN (SELECT "id" FROM "users");--> statement-breakpoint
DELETE FROM "notebooks" WHERE "user_id" NOT IN (SELECT "id" FROM "users");--> statement-breakpoint
UPDATE "notes" SET "notebook_id" = NULL WHERE "notebook_id" IS NOT NULL AND "notebook_id" NOT IN (SELECT "id" FROM "notebooks");--> statement-breakpoint
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_user_notebook_idx" ON "notes" USING btree ("user_id","notebook_id");