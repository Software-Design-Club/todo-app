DO $$ BEGIN
 CREATE TYPE "public"."collaborator_role" AS ENUM('owner', 'collaborator');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "role" "collaborator_role" DEFAULT 'collaborator' NOT NULL;