import { sql } from "@vercel/postgres";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";

import { InvitationsTable, ListsTable } from "@/drizzle/schema";
import { sendInvitationEmail, type EmailServiceSendResponse } from "@/lib/email/service";
import { ListNotFoundError } from "@/lib/errors";
import { verifyInvitationEnv } from "@/lib/invitations/env";
import { assertCanInviteCollaborators } from "@/app/lists/_actions/permissions";
import {
  type AbsoluteInvitationUrl,
  type AppBaseUrl,
  type EmailAddress,
  type InvitationExpiry,
  type InvitationId,
  type InvitationSecret,
  type InvitationSecretHash,
  type List,
  type NormalizedEmailAddress,
  type SentInvitationStatus,
  type User,
} from "@/lib/types";
import {
  createInvitationSecret,
  hashInvitationSecret,
} from "@/lib/invitations/token";

const OPEN_INVITATION_STATUSES = ["pending", "sent"] as const;
const INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type PersistedSentInvitation = {
  invitationId: InvitationId;
  status: SentInvitationStatus;
  expiresAt: InvitationExpiry;
  wasRotated: boolean;
};

export type InviteCollaboratorWorkflowResult = {
  invitationId: InvitationId;
  acceptanceUrl: AbsoluteInvitationUrl;
  emailServiceResponse: EmailServiceSendResponse;
};

function normalizeInvitedEmailAddress(
  invitedEmail: EmailAddress,
): NormalizedEmailAddress {
  return invitedEmail.trim().toLowerCase() as NormalizedEmailAddress;
}

function calculateInvitationExpiry(now: Date): InvitationExpiry {
  return new Date(now.getTime() + INVITATION_TTL_MS) as InvitationExpiry;
}

async function assertListExists(listId: List["id"]) {
  const db = drizzle(sql);
  const [list] = await db
    .select({ id: ListsTable.id })
    .from(ListsTable)
    .where(eq(ListsTable.id, listId))
    .limit(1);

  if (!list) {
    throw new ListNotFoundError(Number(listId));
  }
}

/**
 * @module invitation issuing contracts
 *
 * Persists and rotates open invitation records, constructs acceptance URLs, and
 * executes the end-to-end invitation issuing workflow up to the email service's
 * immediate send response.
 */

/**
 * @contract issueInvitation
 *
 * Persists exactly one open invitation row in the `invitations` table for
 * (listId, invitedEmailNormalized). If an open invitation already existed,
 * rotation invalidates the prior secret while preserving the single-open-invite
 * invariant. Does not send email. Does not write to `list_collaborators`.
 */
export async function issueInvitation(input: {
  listId: List["id"];
  inviterId: User["id"];
  invitedEmail: EmailAddress;
  secretHash: InvitationSecretHash;
  now: Date;
}): Promise<PersistedSentInvitation> {
  const db = drizzle(sql);
  const invitedEmailNormalized = normalizeInvitedEmailAddress(input.invitedEmail);
  const expiresAt = calculateInvitationExpiry(input.now);

  return db.transaction(async (tx) => {
    const [existingInvitation] = await tx
      .select({
        id: InvitationsTable.id,
      })
      .from(InvitationsTable)
      .where(
        and(
          eq(InvitationsTable.listId, input.listId),
          eq(InvitationsTable.invitedEmailNormalized, invitedEmailNormalized),
          inArray(InvitationsTable.status, [...OPEN_INVITATION_STATUSES]),
        ),
      )
      .limit(1);

    if (existingInvitation) {
      const [updatedInvitation] = await tx
        .update(InvitationsTable)
        .set({
          inviterId: input.inviterId,
          invitedEmailNormalized,
          status: "sent",
          secretHash: input.secretHash,
          expiresAt,
          acceptedByUserId: null,
          acceptedByEmail: null,
          resolvedAt: null,
          providerMessageId: null,
          lastDeliveryError: null,
          lastDeliveryAttemptAt: null,
          deliveryEventType: null,
          providerRawEventType: null,
          providerEventReceivedAt: null,
          updatedAt: input.now,
        })
        .where(eq(InvitationsTable.id, existingInvitation.id))
        .returning({
          id: InvitationsTable.id,
          expiresAt: InvitationsTable.expiresAt,
        });

      return {
        invitationId: updatedInvitation.id as InvitationId,
        status: "sent" as SentInvitationStatus,
        expiresAt: updatedInvitation.expiresAt as InvitationExpiry,
        wasRotated: true,
      };
    }

    const [createdInvitation] = await tx
      .insert(InvitationsTable)
      .values({
        listId: input.listId,
        inviterId: input.inviterId,
        invitedEmailNormalized,
        role: "collaborator",
        status: "sent",
        secretHash: input.secretHash,
        expiresAt,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning({
        id: InvitationsTable.id,
        expiresAt: InvitationsTable.expiresAt,
      });

    return {
      invitationId: createdInvitation.id as InvitationId,
      status: "sent" as SentInvitationStatus,
      expiresAt: createdInvitation.expiresAt as InvitationExpiry,
      wasRotated: false,
    };
  });
}

/**
 * @contract buildInvitationAcceptanceUrl
 *
 * Returns the canonical app URL for /invite?token=...
 * Uses the configured base URL and does not emit a relative URL.
 */
export function buildInvitationAcceptanceUrl(input: {
  appBaseUrl: AppBaseUrl;
  secret: InvitationSecret;
}): AbsoluteInvitationUrl {
  const acceptanceUrl = new URL("/invite", input.appBaseUrl);
  acceptanceUrl.searchParams.set("token", input.secret);

  return acceptanceUrl.toString() as AbsoluteInvitationUrl;
}

/**
 * @contract invalidateOpenInvitesForList
 *
 * Moves all open invitations (pending, sent) for a given list to a terminal
 * status (revoked or expired). Does not modify list_collaborators.
 *
 * @returns The count of updated invitation rows.
 */
export async function invalidateOpenInvitesForList(input: {
  listId: List["id"];
  now: Date;
  terminalStatus: "revoked" | "expired";
}): Promise<number> {
  const db = drizzle(sql);
  const invalidated = await db
    .update(InvitationsTable)
    .set({
      status: input.terminalStatus,
      resolvedAt: input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(InvitationsTable.listId, input.listId),
        inArray(InvitationsTable.status, [...OPEN_INVITATION_STATUSES]),
      ),
    )
    .returning({ id: InvitationsTable.id });

  return invalidated.length;
}

/**
 * @contract inviteCollaboratorWorkflow
 *
 * End-to-end workflow for inviting someone to a list by email.
 *
 * @param input.listId - The list to invite to.
 * @param input.inviterId - The user sending the invitation.
 * @param input.invitedEmail - The email to invite.
 * @param input.now - Current timestamp for expiry calculation.
 * @returns The invitation ID, acceptance URL, and generic email-service response.
 *
 * @effects
 * - Requires inviterId to be allowed to invite collaborators to listId.
 * - After return, exactly one open invitation row exists in `invitations` for
 *   (listId, invitedEmailNormalized).
 * - The persisted invitation contains hashed secret, expiry, inviter id, normalized
 *   email, and status="sent".
 * - The returned acceptance URL contains the one-time secret matching the persisted hash.
 * - Attempts exactly one email send per invocation.
 * - Returns the generic email-service send response for later interpretation.
 * - If an open invite already existed, previously issued secrets become unusable
 *   and the returned secret becomes authoritative.
 *
 * @throws InvitationPermissionDeniedError if inviterId is not allowed to invite.
 * @throws ListNotFoundError if listId does not exist.
 */
export async function inviteCollaboratorWorkflow(input: {
  listId: List["id"];
  inviterId: User["id"];
  invitedEmail: EmailAddress;
  now: Date;
}): Promise<InviteCollaboratorWorkflowResult> {
  await assertListExists(input.listId);
  await assertCanInviteCollaborators({
    listId: input.listId,
    actorId: input.inviterId,
  });

  const secret = createInvitationSecret();
  const secretHash = hashInvitationSecret(secret);
  const persistedInvitation = await issueInvitation({
    listId: input.listId,
    inviterId: input.inviterId,
    invitedEmail: input.invitedEmail,
    secretHash,
    now: input.now,
  });
  const invitationEnv = verifyInvitationEnv(process.env);
  const acceptanceUrl = buildInvitationAcceptanceUrl({
    appBaseUrl: invitationEnv.appBaseUrl,
    secret,
  });
  const emailServiceResponse = await sendInvitationEmail({
    invitationId: persistedInvitation.invitationId,
    acceptanceUrl,
  });

  return {
    invitationId: persistedInvitation.invitationId,
    acceptanceUrl,
    emailServiceResponse,
  };
}
