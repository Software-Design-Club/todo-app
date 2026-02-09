-- Drop index from 0007 (migration file removed, consolidating here)
DROP INDEX IF EXISTS "list_collaborators_email_delivery_provider_id_idx";
--> statement-breakpoint

-- Rename owner* columns to invitation* for consistent naming
ALTER TABLE "list_collaborators" RENAME COLUMN "ownerApprovalRequestedAt" TO "invitationApprovalRequestedAt";
--> statement-breakpoint
ALTER TABLE "list_collaborators" RENAME COLUMN "ownerApprovedBy" TO "invitationApprovedBy";
--> statement-breakpoint
ALTER TABLE "list_collaborators" RENAME COLUMN "ownerApprovedAt" TO "invitationApprovedAt";
--> statement-breakpoint
ALTER TABLE "list_collaborators" RENAME COLUMN "ownerRejectedBy" TO "invitationRejectedBy";
--> statement-breakpoint
ALTER TABLE "list_collaborators" RENAME COLUMN "ownerRejectedAt" TO "invitationRejectedAt";
--> statement-breakpoint

-- Rename pending_owner_approval enum value to pending_approval
ALTER TYPE "invitation_status" RENAME VALUE 'pending_owner_approval' TO 'pending_approval';
--> statement-breakpoint

-- Update partial unique index to use renamed enum value
DROP INDEX IF EXISTS "list_collaborators_open_invite_email_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "list_collaborators_open_invite_email_unique"
  ON "list_collaborators" ("listId", "invitedEmailNormalized")
  WHERE "inviteStatus" IN ('sent', 'pending_approval') AND "invitedEmailNormalized" IS NOT NULL;
