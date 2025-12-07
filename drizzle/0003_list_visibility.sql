CREATE TYPE "list_visibility" AS ENUM
('private', 'public');--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "visibility" "list_visibility" DEFAULT 'private' NOT NULL;
