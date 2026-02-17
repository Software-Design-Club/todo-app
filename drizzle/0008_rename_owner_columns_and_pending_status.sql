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
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'invitation_status'
      AND enum_value.enumlabel = 'pending_owner_approval'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum enum_value
    JOIN pg_type enum_type ON enum_type.oid = enum_value.enumtypid
    WHERE enum_type.typname = 'invitation_status'
      AND enum_value.enumlabel = 'pending_approval'
  ) THEN
    ALTER TYPE "invitation_status" RENAME VALUE 'pending_owner_approval' TO 'pending_approval';
  END IF;
END
$$;
--> statement-breakpoint

-- Update partial unique index to use renamed enum value
DROP INDEX IF EXISTS "list_collaborators_open_invite_email_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "list_collaborators_open_invite_email_unique"
  ON "list_collaborators" ("listId", "invitedEmailNormalized")
  WHERE "inviteStatus" IN ('sent', 'pending_approval') AND "invitedEmailNormalized" IS NOT NULL;
