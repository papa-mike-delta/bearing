ALTER TABLE "users" ADD COLUMN "theme_choice" text DEFAULT 'grayscale' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme_light" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme_dark" text;