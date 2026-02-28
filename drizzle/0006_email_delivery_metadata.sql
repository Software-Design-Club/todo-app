ALTER TABLE "list_collaborators" ADD COLUMN "emailDeliveryStatus" text;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "emailDeliveryError" text;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "emailDeliveryProviderId" text;
--> statement-breakpoint
ALTER TABLE "list_collaborators" ADD COLUMN "emailLastSentAt" timestamp;
