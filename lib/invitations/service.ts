import { sql } from "@vercel/postgres";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";

import { InvitationsTable, ListCollaboratorsTable, ListsTable } from "@/drizzle/schema";
import { sendInvitationEmail, type EmailServiceSendResponse } from "@/lib/email/service";
import { ListNotFoundError } from "@/lib/errors";
import { verifyInvitationEnv } from "@/lib/invitations/env";
import { buildInviteContinuationTarget } from "@/lib/invitations/redirect";
import { assertCanInviteCollaborators } from "@/app/lists/_actions/permissions";
import {
  type AbsoluteInvitationUrl,
  type AcceptInvitationWorkflowResult,
  type AppBaseUrl,
  type AuthenticatedUser,
  type EmailAddress,
  type InvitationExpiry,
  type InvitationId,
  type InvitationSecret,
  type InvitationSecretHash,
  type List,
  type ListId,
  type NormalizedEmailAddress,
  type ResolveInviteAcceptanceResult,
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

/**
 * @contract resolveInviteAcceptance (Contract 6.4)
 *
 * Resolves an invitation acceptance attempt. Atomically transitions the
 * invitation to accepted (with list_collaborators insert) or pending_approval
 * (without list_collaborators insert) based on email match.
 */
export async function resolveInviteAcceptance(input: {
  invitationSecret: InvitationSecret;
  viewer: AuthenticatedUser;
  now: Date;
}): Promise<ResolveInviteAcceptanceResult> {
  const db = drizzle(sql);
  const secretHash = hashInvitationSecret(input.invitationSecret);

  const [invitation] = await db
    .select({
      id: InvitationsTable.id,
      listId: InvitationsTable.listId,
      status: InvitationsTable.status,
      invitedEmailNormalized: InvitationsTable.invitedEmailNormalized,
      expiresAt: InvitationsTable.expiresAt,
    })
    .from(InvitationsTable)
    .where(eq(InvitationsTable.secretHash, secretHash))
    .limit(1);

  if (!invitation) {
    return { kind: "invalid" };
  }

  const isOpen = invitation.status === "pending" || invitation.status === "sent";

  if (!isOpen) {
    if (invitation.status === "expired") {
      return { kind: "expired" };
    }
    if (invitation.status === "revoked") {
      return { kind: "revoked" };
    }
    return { kind: "already_resolved" };
  }

  if (invitation.expiresAt && invitation.expiresAt < input.now) {
    return { kind: "expired" };
  }

  const viewerEmailNormalized = input.viewer.email
    .trim()
    .toLowerCase() as NormalizedEmailAddress;
  const emailMatches =
    viewerEmailNormalized === invitation.invitedEmailNormalized;
  const listId = invitation.listId as ListId;

  return db.transaction(async (tx) => {
    if (emailMatches) {
      const updated = await tx
        .update(InvitationsTable)
        .set({
          status: "accepted",
          acceptedByUserId: input.viewer.id,
          resolvedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(InvitationsTable.id, invitation.id),
            inArray(InvitationsTable.status, [...OPEN_INVITATION_STATUSES]),
          ),
        )
        .returning({ id: InvitationsTable.id });

      if (updated.length === 0) {
        return { kind: "already_resolved" as const };
      }

      await tx.insert(ListCollaboratorsTable).values({
        listId: invitation.listId,
        userId: input.viewer.id,
        role: "collaborator",
      });

      return { kind: "accepted" as const, listId };
    }

    // Email mismatch: set to pending_approval
    const updated = await tx
      .update(InvitationsTable)
      .set({
        status: "pending_approval",
        acceptedByUserId: input.viewer.id,
        acceptedByEmail: viewerEmailNormalized,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(InvitationsTable.id, invitation.id),
          inArray(InvitationsTable.status, [...OPEN_INVITATION_STATUSES]),
        ),
      )
      .returning({ id: InvitationsTable.id });

    if (updated.length === 0) {
      return { kind: "already_resolved" as const };
    }

    return { kind: "pending_approval" as const, listId };
  });
}

/**
 * @contract acceptInvitationWorkflow (Contract 6.1)
 *
 * Entry point for consuming an invite link. If the viewer is not authenticated,
 * redirects to sign-in with a continuation target. Otherwise, delegates to
 * resolveInviteAcceptance.
 */
export async function acceptInvitationWorkflow(input: {
  invitationSecret: InvitationSecret;
  viewer: AuthenticatedUser | null;
  now: Date;
}): Promise<AcceptInvitationWorkflowResult> {
  if (!input.viewer) {
    return {
      kind: "redirect_to_sign_in",
      redirectTo: buildInviteContinuationTarget(input.invitationSecret),
    };
  }

  return resolveInviteAcceptance({
    invitationSecret: input.invitationSecret,
    viewer: input.viewer,
    now: input.now,
  });
}
