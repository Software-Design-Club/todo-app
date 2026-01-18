-- Add list_state enum
DO $$ BEGIN
 CREATE TYPE "public"."list_state" AS ENUM('active', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Add state column to lists table
ALTER TABLE "lists" ADD COLUMN "state" "list_state" DEFAULT 'active' NOT NULL;
--> statement-breakpoint

-- Update foreign key on list_collaborators to cascade delete
ALTER TABLE "list_collaborators" DROP CONSTRAINT IF EXISTS "list_collaborators_listId_lists_id_fk";
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD CONSTRAINT "list_collaborators_listId_lists_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint

-- Update foreign key on todos to cascade delete
ALTER TABLE "todos" DROP CONSTRAINT IF EXISTS "todos_listId_lists_id_fk";
--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_listId_lists_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
