DO $$ BEGIN
 CREATE TYPE "public"."invitation_lifecycle_status" AS ENUM(
  'pending',
  'sent',
  'accepted',
  'pending_approval',
  'revoked',
  'expired'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 CREATE TYPE "public"."invitation_delivery_event_type" AS ENUM(
  'failed',
  'bounced',
  'delayed',
  'complained'
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "invitations" (
 "id" serial PRIMARY KEY NOT NULL,
 "listId" integer NOT NULL,
 "inviterId" integer,
 "invitedEmailNormalized" text,
 "role" "public"."collaborator_role" DEFAULT 'collaborator' NOT NULL,
 "status" "public"."invitation_lifecycle_status" NOT NULL,
 "secretHash" text,
 "expiresAt" timestamp,
 "acceptedByUserId" integer,
 "acceptedByEmail" text,
 "resolvedAt" timestamp,
 "providerMessageId" text,
 "lastDeliveryError" text,
 "lastDeliveryAttemptAt" timestamp,
 "deliveryEventType" "public"."invitation_delivery_event_type",
 "providerRawEventType" text,
 "providerEventReceivedAt" timestamp,
 "createdAt" timestamp DEFAULT now() NOT NULL,
 "updatedAt" timestamp DEFAULT now() NOT NULL,
 CONSTRAINT "invitations_open_requires_core_fields" CHECK (
  "status" NOT IN ('pending', 'sent')
  OR (
   "inviterId" IS NOT NULL
   AND "invitedEmailNormalized" IS NOT NULL
   AND "secretHash" IS NOT NULL
   AND "expiresAt" IS NOT NULL
   AND "acceptedByUserId" IS NULL
   AND "acceptedByEmail" IS NULL
   AND "resolvedAt" IS NULL
  )
 ),
 CONSTRAINT "invitations_pending_approval_requires_acceptor" CHECK (
  "status" <> 'pending_approval'
  OR "acceptedByUserId" IS NOT NULL
 ),
 CONSTRAINT "invitations_accepted_requires_acceptor_and_resolved_at" CHECK (
  "status" <> 'accepted'
  OR (
   "acceptedByUserId" IS NOT NULL
   AND "resolvedAt" IS NOT NULL
  )
 ),
 CONSTRAINT "invitations_terminal_requires_resolved_at" CHECK (
  "status" NOT IN ('revoked', 'expired')
  OR "resolvedAt" IS NOT NULL
 ),
 CONSTRAINT "invitations_accepted_by_email_tracks_mismatch" CHECK (
  "acceptedByEmail" IS NULL
  OR "acceptedByEmail" <> "invitedEmailNormalized"
 )
);
--> statement-breakpoint

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_listId_lists_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."lists"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviterId_todo_users_id_fk" FOREIGN KEY ("inviterId") REFERENCES "public"."todo_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE "invitations" ADD CONSTRAINT "invitations_acceptedByUserId_todo_users_id_fk" FOREIGN KEY ("acceptedByUserId") REFERENCES "public"."todo_users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "invitations_list_id_status_idx" ON "invitations" USING btree ("listId","status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "invitations_secret_hash_idx" ON "invitations" USING btree ("secretHash");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "invitations_list_email_status_idx" ON "invitations" USING btree ("listId","invitedEmailNormalized","status");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "invitations_open_email_unique_idx" ON "invitations" USING btree ("listId","invitedEmailNormalized") WHERE "status" in ('pending', 'sent');
--> statement-breakpoint

DO $$
DECLARE
 legacy_columns_present boolean;
 legacy_invitation_rows integer;
 migrated_rows integer;
BEGIN
 SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
   AND table_name = 'list_collaborators'
   AND column_name = 'inviteStatus'
 ) INTO legacy_columns_present;

 IF NOT legacy_columns_present THEN
  RETURN;
 END IF;

 WITH legacy_invitations AS (
  SELECT *
  FROM "list_collaborators"
  WHERE (
   "inviteStatus" <> 'accepted'
   OR "inviteTokenHash" IS NOT NULL
   OR "invitedEmailNormalized" IS NOT NULL
   OR "inviterId" IS NOT NULL
   OR "inviteSentAt" IS NOT NULL
   OR "inviteAcceptedAt" IS NOT NULL
   OR "inviteRevokedAt" IS NOT NULL
   OR "inviteExpiredAt" IS NOT NULL
   OR "invitationApprovalRequestedAt" IS NOT NULL
   OR "invitationApprovedBy" IS NOT NULL
   OR "invitationApprovedAt" IS NOT NULL
   OR "invitationRejectedBy" IS NOT NULL
   OR "invitationRejectedAt" IS NOT NULL
   OR "emailDeliveryStatus" IS NOT NULL
   OR "emailDeliveryError" IS NOT NULL
   OR "emailDeliveryProviderId" IS NOT NULL
   OR "emailLastSentAt" IS NOT NULL
  )
 )
 SELECT COUNT(*)::integer
 FROM legacy_invitations
 INTO legacy_invitation_rows;

 WITH legacy_invitations AS (
  SELECT *
  FROM "list_collaborators"
  WHERE (
   "inviteStatus" <> 'accepted'
   OR "inviteTokenHash" IS NOT NULL
   OR "invitedEmailNormalized" IS NOT NULL
   OR "inviterId" IS NOT NULL
   OR "inviteSentAt" IS NOT NULL
   OR "inviteAcceptedAt" IS NOT NULL
   OR "inviteRevokedAt" IS NOT NULL
   OR "inviteExpiredAt" IS NOT NULL
   OR "invitationApprovalRequestedAt" IS NOT NULL
   OR "invitationApprovedBy" IS NOT NULL
   OR "invitationApprovedAt" IS NOT NULL
   OR "invitationRejectedBy" IS NOT NULL
   OR "invitationRejectedAt" IS NOT NULL
   OR "emailDeliveryStatus" IS NOT NULL
   OR "emailDeliveryError" IS NOT NULL
   OR "emailDeliveryProviderId" IS NOT NULL
   OR "emailLastSentAt" IS NOT NULL
  )
 ), inserted_rows AS (
  INSERT INTO "invitations" (
   "listId",
   "inviterId",
   "invitedEmailNormalized",
   "role",
   "status",
   "secretHash",
   "expiresAt",
   "acceptedByUserId",
   "acceptedByEmail",
   "resolvedAt",
   "providerMessageId",
   "lastDeliveryError",
   "lastDeliveryAttemptAt",
   "deliveryEventType",
   "providerRawEventType",
   "providerEventReceivedAt",
   "createdAt",
   "updatedAt"
  )
  SELECT
   legacy."listId",
   legacy."inviterId",
   legacy."invitedEmailNormalized",
   legacy."role",
    CASE
    WHEN legacy."inviteStatus"::text = 'sent' THEN 'sent'::"public"."invitation_lifecycle_status"
    WHEN legacy."inviteStatus"::text = 'accepted' THEN 'accepted'::"public"."invitation_lifecycle_status"
    WHEN legacy."inviteStatus"::text = 'pending_approval' THEN 'pending_approval'::"public"."invitation_lifecycle_status"
    WHEN legacy."inviteStatus"::text = 'revoked' THEN 'revoked'::"public"."invitation_lifecycle_status"
    WHEN legacy."inviteStatus"::text = 'expired' THEN 'expired'::"public"."invitation_lifecycle_status"
    ELSE 'accepted'::"public"."invitation_lifecycle_status"
   END,
   legacy."inviteTokenHash",
   legacy."inviteExpiresAt",
   CASE
    WHEN legacy."inviteStatus"::text IN ('accepted', 'pending_approval') THEN legacy."userId"
    ELSE NULL
   END,
   NULL,
   CASE
    WHEN legacy."inviteStatus"::text = 'accepted' THEN COALESCE(
      legacy."inviteAcceptedAt",
      legacy."invitationApprovedAt",
      legacy."updatedAt"
    )
    WHEN legacy."inviteStatus"::text = 'pending_approval' THEN COALESCE(
      legacy."invitationApprovalRequestedAt",
      legacy."updatedAt"
    )
    WHEN legacy."inviteStatus"::text = 'revoked' THEN COALESCE(
      legacy."inviteRevokedAt",
      legacy."invitationRejectedAt",
      legacy."updatedAt"
    )
    WHEN legacy."inviteStatus"::text = 'expired' THEN COALESCE(
      legacy."inviteExpiredAt",
      legacy."updatedAt"
    )
    ELSE NULL
   END,
   legacy."emailDeliveryProviderId",
   legacy."emailDeliveryError",
   COALESCE(legacy."emailLastSentAt", legacy."inviteSentAt"),
   CASE
    WHEN legacy."emailDeliveryStatus" IN ('failed', 'bounced', 'delayed', 'complained')
      THEN legacy."emailDeliveryStatus"::"public"."invitation_delivery_event_type"
    ELSE NULL
   END,
   CASE
    WHEN legacy."emailDeliveryStatus" IN ('failed', 'bounced', 'delayed', 'complained')
      THEN legacy."emailDeliveryStatus"
    ELSE NULL
   END,
   CASE
    WHEN legacy."emailDeliveryStatus" IN ('failed', 'bounced', 'delayed', 'complained')
      THEN COALESCE(legacy."emailLastSentAt", legacy."updatedAt")
    ELSE NULL
   END,
   legacy."createdAt",
   legacy."updatedAt"
  FROM legacy_invitations legacy
  RETURNING 1
 )
 SELECT COUNT(*)::integer
 FROM inserted_rows
 INTO migrated_rows;

 IF migrated_rows <> legacy_invitation_rows THEN
  RAISE EXCEPTION
   'Invitation migration row-count mismatch: expected %, migrated %',
   legacy_invitation_rows,
   migrated_rows;
 END IF;

 DELETE FROM "list_collaborators"
 WHERE "userId" IS NULL
  AND (
   "inviteStatus" <> 'accepted'
   OR "inviteTokenHash" IS NOT NULL
   OR "invitedEmailNormalized" IS NOT NULL
   OR "inviterId" IS NOT NULL
   OR "inviteSentAt" IS NOT NULL
   OR "inviteAcceptedAt" IS NOT NULL
   OR "inviteRevokedAt" IS NOT NULL
   OR "inviteExpiredAt" IS NOT NULL
   OR "invitationApprovalRequestedAt" IS NOT NULL
   OR "invitationApprovedBy" IS NOT NULL
   OR "invitationApprovedAt" IS NOT NULL
   OR "invitationRejectedBy" IS NOT NULL
   OR "invitationRejectedAt" IS NOT NULL
   OR "emailDeliveryStatus" IS NOT NULL
   OR "emailDeliveryError" IS NOT NULL
   OR "emailDeliveryProviderId" IS NOT NULL
   OR "emailLastSentAt" IS NOT NULL
  );
END $$;
--> statement-breakpoint

ALTER TABLE "list_collaborators" ALTER COLUMN "userId" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "inviteStatus";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "invitedEmailNormalized";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "inviteTokenHash";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "inviteExpiresAt";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "inviterId";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "inviteSentAt";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "inviteAcceptedAt";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "inviteRevokedAt";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "inviteExpiredAt";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "invitationApprovalRequestedAt";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "invitationApprovedBy";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "invitationApprovedAt";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "invitationRejectedBy";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "invitationRejectedAt";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "emailDeliveryStatus";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "emailDeliveryError";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "emailDeliveryProviderId";
--> statement-breakpoint

ALTER TABLE "list_collaborators" DROP COLUMN IF EXISTS "emailLastSentAt";
