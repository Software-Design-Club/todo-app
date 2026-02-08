-- Add invitation_status enum for collaborator invitation lifecycle
DO $$ BEGIN
 CREATE TYPE "public"."invitation_status" AS ENUM('sent', 'accepted', 'pending_owner_approval', 'revoked', 'expired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Allow pending email invitations without a concrete user account
ALTER TABLE "list_collaborators" ALTER COLUMN "userId" DROP NOT NULL;
--> statement-breakpoint

-- Invitation metadata columns
ALTER TABLE "list_collaborators" ADD COLUMN "inviteStatus" "invitation_status" DEFAULT 'accepted' NOT NULL;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "invitedEmailNormalized" text;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "inviteTokenHash" text;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "inviteExpiresAt" timestamp;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "inviterId" integer;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "inviteSentAt" timestamp;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "inviteAcceptedAt" timestamp;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "inviteRevokedAt" timestamp;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "inviteExpiredAt" timestamp;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "ownerApprovalRequestedAt" timestamp;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "ownerApprovedBy" integer;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "ownerApprovedAt" timestamp;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "ownerRejectedBy" integer;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "ownerRejectedAt" timestamp;
--> statement-breakpoint

-- FK references for invitation lifecycle actors
ALTER TABLE "list_collaborators" ADD CONSTRAINT "list_collaborators_inviterId_todo_users_id_fk" FOREIGN KEY ("inviterId") REFERENCES "public"."todo_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD CONSTRAINT "list_collaborators_ownerApprovedBy_todo_users_id_fk" FOREIGN KEY ("ownerApprovedBy") REFERENCES "public"."todo_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD CONSTRAINT "list_collaborators_ownerRejectedBy_todo_users_id_fk" FOREIGN KEY ("ownerRejectedBy") REFERENCES "public"."todo_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

-- Backfill all legacy collaborator memberships into accepted lifecycle state
UPDATE "list_collaborators"
SET
  "inviteStatus" = 'accepted',
  "inviteAcceptedAt" = COALESCE("inviteAcceptedAt", NOW())
WHERE "userId" IS NOT NULL;
--> statement-breakpoint

-- Invitation lifecycle uniqueness and lookup indexes
CREATE UNIQUE INDEX IF NOT EXISTS "list_collaborators_accepted_membership_unique" ON "list_collaborators" USING btree ("listId", "userId") WHERE "inviteStatus" = 'accepted' AND "userId" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "list_collaborators_open_invite_email_unique" ON "list_collaborators" USING btree ("listId", "invitedEmailNormalized") WHERE "inviteStatus" IN ('sent', 'pending_owner_approval') AND "invitedEmailNormalized" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "list_collaborators_invite_token_hash_idx" ON "list_collaborators" USING btree ("inviteTokenHash");
