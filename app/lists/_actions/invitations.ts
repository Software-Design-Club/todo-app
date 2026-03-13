"use server";

import { sql } from "@vercel/postgres";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";

import { auth } from "@/auth";
import { InvitationsTable, ListCollaboratorsTable } from "@/drizzle/schema";
import {
  inviteCollaboratorWorkflow,
  issueInvitation,
  buildInvitationAcceptanceUrl,
  handleInvitationSendResponseWorkflow,
} from "@/lib/invitations/service";
import { assertCanManageCollaborators } from "@/app/lists/_actions/permissions";
import { verifyInvitationEnv } from "@/lib/invitations/env";
import { sendInvitationEmail } from "@/lib/email/service";
import {
  createInvitationSecret,
  hashInvitationSecret,
} from "@/lib/invitations/token";
import type {
  EmailAddress,
  InvitationId,
  InvitationExpiry,
  InviteCollaboratorResult,
  InvitationSummary,
  List,
  ListId,
  NormalizedEmailAddress,
  PendingApprovalInvitationSummary,
  SentInvitationSummary,
  User,
  UserId,
} from "@/lib/types";
import { CollaboratorManagementPermissionDeniedError } from "@/lib/invitations/errors";

async function requireInvitationActionActorId(fallbackActorId?: UserId) {
  const session = await auth();

  if (session?.user?.id) {
    return session.user.id as UserId;
  }

  if (
    fallbackActorId &&
    (process.env.NODE_ENV === "test" || process.env.E2E_AUTH_ENABLED === "1")
  ) {
    return fallbackActorId;
  }

  throw new Error("Authentication required");
}

/**
 * @contract inviteCollaborator (Contracts 2.3–2.6)
 *
 * Server-action wrapper around the invitation issuing workflow.
 * Returns InviteCollaboratorResult tagged union on success/delivery failure.
 * Propagates CollaboratorManagementPermissionDeniedError without folding.
 */
export async function inviteCollaborator(input: {
  listId: List["id"];
  inviterId?: User["id"];
  invitedEmail: EmailAddress;
  now?: Date;
}): Promise<InviteCollaboratorResult> {
  const inviterId = await requireInvitationActionActorId(input.inviterId);

  // Permission check BEFORE try-catch — throws CollaboratorManagementPermissionDeniedError if not owner
  await assertCanManageCollaborators({
    listId: input.listId,
    actorId: inviterId,
  });

  try {
    const result = await inviteCollaboratorWorkflow({
      listId: input.listId,
      inviterId,
      invitedEmail: input.invitedEmail,
      now: input.now ?? new Date(),
    });

    if (result.emailServiceResponse.kind === "rejected") {
      return {
        kind: "failure",
        errorMessage: `Invitation saved but email delivery failed: ${result.emailServiceResponse.errorMessage}`,
      };
    }

    return {
      kind: "success",
      invitation: {
        kind: "sent",
        invitationId: result.invitationId,
        listId: input.listId,
        invitedEmailNormalized: input.invitedEmail
          .trim()
          .toLowerCase() as NormalizedEmailAddress,
        expiresAt: result.expiresAt,
      },
    };
  } catch (error) {
    if (error instanceof CollaboratorManagementPermissionDeniedError) {
      throw error;
    }
    return {
      kind: "failure",
      errorMessage:
        error instanceof Error && error.message
          ? error.message
          : "Failed to send invitation.",
    };
  }
}

/**
 * @contract getInvitations
 *
 * Returns open invitations (status `sent` or `pending_approval`) for a given list.
 * Only callable by list owners; enforces collaborator-management permission.
 *
 * @throws CollaboratorManagementPermissionDeniedError if actorId is not an owner of the list.
 */
export async function getInvitations(
  listId: List["id"],
  actorId?: UserId,
): Promise<InvitationSummary[]> {
  const db = drizzle(sql);
  const resolvedActorId = await requireInvitationActionActorId(actorId);

  await assertCanManageCollaborators({ listId, actorId: resolvedActorId });

  const rows = await db
    .select({
      id: InvitationsTable.id,
      listId: InvitationsTable.listId,
      invitedEmailNormalized: InvitationsTable.invitedEmailNormalized,
      status: InvitationsTable.status,
      expiresAt: InvitationsTable.expiresAt,
      acceptedByUserId: InvitationsTable.acceptedByUserId,
      acceptedByEmail: InvitationsTable.acceptedByEmail,
    })
    .from(InvitationsTable)
    .where(
      and(
        eq(InvitationsTable.listId, listId),
        inArray(InvitationsTable.status, ["sent", "pending_approval"]),
      ),
    );

  return rows.map((row): InvitationSummary => {
    if (row.status === "sent") {
      return {
        kind: "sent",
        invitationId: row.id as SentInvitationSummary["invitationId"],
        listId: row.listId as ListId,
        invitedEmailNormalized:
          row.invitedEmailNormalized as NormalizedEmailAddress,
        expiresAt: row.expiresAt as InvitationExpiry,
      };
    }

    // pending_approval
    return {
      kind: "pending_approval",
      invitationId: row.id as PendingApprovalInvitationSummary["invitationId"],
      listId: row.listId as ListId,
      invitedEmailNormalized:
        row.invitedEmailNormalized as NormalizedEmailAddress,
      expiresAt: row.expiresAt as InvitationExpiry,
      acceptedByUserId: row.acceptedByUserId as UserId,
      acceptedByEmail: row.acceptedByEmail as NormalizedEmailAddress | null,
    };
  });
}

/**
 * @contract approveInvitation (Contract 8.6)
 *
 * Server action. Atomically transitions a pending_approval invitation to accepted,
 * sets resolvedAt, and inserts a list_collaborators row for acceptedByUserId.
 *
 * @throws CollaboratorManagementPermissionDeniedError if actorId is not an owner of the list.
 */
export async function approveInvitation(input: {
  invitationId: InvitationId;
  actorId?: UserId;
  now?: Date;
}): Promise<void> {
  const db = drizzle(sql);
  const now = input.now ?? new Date();
  const actorId = await requireInvitationActionActorId(input.actorId);

  // Fetch the invitation to verify it belongs to a list the actor owns
  const [invitation] = await db
    .select({
      id: InvitationsTable.id,
      listId: InvitationsTable.listId,
      status: InvitationsTable.status,
      acceptedByUserId: InvitationsTable.acceptedByUserId,
    })
    .from(InvitationsTable)
    .where(eq(InvitationsTable.id, input.invitationId))
    .limit(1);

  if (!invitation) {
    throw new Error(`Invitation ${String(input.invitationId)} not found`);
  }

  await assertCanManageCollaborators({
    listId: invitation.listId as List["id"],
    actorId,
  });

  if (invitation.status !== "pending_approval") {
    throw new Error(
      `Invitation ${String(input.invitationId)} is not in pending_approval status (got: ${invitation.status})`,
    );
  }

  if (!invitation.acceptedByUserId) {
    throw new Error(
      `Invitation ${String(input.invitationId)} has no acceptedByUserId`,
    );
  }

  await db.transaction(async (tx) => {
    const updatedInvitations = await tx
      .update(InvitationsTable)
      .set({
        status: "accepted",
        resolvedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(InvitationsTable.id, invitation.id),
          eq(InvitationsTable.status, "pending_approval"),
        ),
      )
      .returning({ id: InvitationsTable.id });

    if (updatedInvitations.length === 0) {
      throw new Error(
        `Invitation ${String(input.invitationId)} is no longer pending approval`,
      );
    }

    await tx.insert(ListCollaboratorsTable).values({
      listId: invitation.listId,
      userId: invitation.acceptedByUserId!,
      role: "collaborator",
    });
  });
}

/**
 * @contract rejectInvitation (Contract 8.6)
 *
 * Server action. Updates a pending_approval invitation status to revoked,
 * sets resolvedAt. Does NOT create a list_collaborators row.
 *
 * @throws CollaboratorManagementPermissionDeniedError if actorId is not an owner of the list.
 */
export async function rejectInvitation(input: {
  invitationId: InvitationId;
  actorId?: UserId;
  now?: Date;
}): Promise<void> {
  const db = drizzle(sql);
  const now = input.now ?? new Date();
  const actorId = await requireInvitationActionActorId(input.actorId);

  const [invitation] = await db
    .select({
      id: InvitationsTable.id,
      listId: InvitationsTable.listId,
      status: InvitationsTable.status,
    })
    .from(InvitationsTable)
    .where(eq(InvitationsTable.id, input.invitationId))
    .limit(1);

  if (!invitation) {
    throw new Error(`Invitation ${String(input.invitationId)} not found`);
  }

  await assertCanManageCollaborators({
    listId: invitation.listId as List["id"],
    actorId,
  });

  if (invitation.status !== "pending_approval") {
    throw new Error(
      `Invitation ${String(input.invitationId)} is not in pending_approval status (got: ${invitation.status})`,
    );
  }

  await db
    .update(InvitationsTable)
    .set({
      status: "revoked",
      resolvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(InvitationsTable.id, invitation.id),
        eq(InvitationsTable.status, "pending_approval"),
      ),
    );
}

/**
 * @contract revokeInvitation (Contract 8.6)
 *
 * Server action. Revokes a sent invitation, setting status to revoked and resolvedAt.
 *
 * @throws CollaboratorManagementPermissionDeniedError if actorId is not an owner of the list.
 */
export async function revokeInvitation(input: {
  invitationId: InvitationId;
  actorId?: UserId;
  now?: Date;
}): Promise<void> {
  const db = drizzle(sql);
  const now = input.now ?? new Date();
  const actorId = await requireInvitationActionActorId(input.actorId);

  const [invitation] = await db
    .select({
      id: InvitationsTable.id,
      listId: InvitationsTable.listId,
      status: InvitationsTable.status,
    })
    .from(InvitationsTable)
    .where(eq(InvitationsTable.id, input.invitationId))
    .limit(1);

  if (!invitation) {
    throw new Error(`Invitation ${String(input.invitationId)} not found`);
  }

  await assertCanManageCollaborators({
    listId: invitation.listId as List["id"],
    actorId,
  });

  await db
    .update(InvitationsTable)
    .set({
      status: "revoked",
      resolvedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(InvitationsTable.id, invitation.id),
        eq(InvitationsTable.status, "sent"),
      ),
    );
}

/**
 * @contract resendInvitation (Contract 8.6)
 *
 * Server action. Re-issues the invitation (rotates secret) and re-sends the email.
 *
 * @throws CollaboratorManagementPermissionDeniedError if actorId is not an owner of the list.
 */
export async function resendInvitation(input: {
  invitationId: InvitationId;
  actorId?: UserId;
  now?: Date;
}): Promise<void> {
  const db = drizzle(sql);
  const now = input.now ?? new Date();
  const actorId = await requireInvitationActionActorId(input.actorId);

  const [invitation] = await db
    .select({
      id: InvitationsTable.id,
      listId: InvitationsTable.listId,
      invitedEmailNormalized: InvitationsTable.invitedEmailNormalized,
      status: InvitationsTable.status,
    })
    .from(InvitationsTable)
    .where(eq(InvitationsTable.id, input.invitationId))
    .limit(1);

  if (!invitation) {
    throw new Error(`Invitation ${String(input.invitationId)} not found`);
  }

  if (!invitation.invitedEmailNormalized) {
    throw new Error(
      `Invitation ${String(input.invitationId)} has no invited email`,
    );
  }

  await assertCanManageCollaborators({
    listId: invitation.listId as List["id"],
    actorId,
  });

  if (invitation.status !== "sent" && invitation.status !== "pending") {
    throw new Error(
      `Invitation ${String(input.invitationId)} cannot be resent from status ${invitation.status}`,
    );
  }

  const secret = createInvitationSecret();
  const secretHash = hashInvitationSecret(secret);

  const persistedInvitation = await issueInvitation({
    listId: invitation.listId as List["id"],
    inviterId: actorId,
    invitedEmail: invitation.invitedEmailNormalized as EmailAddress,
    secretHash,
    now,
  });

  const invitationEnv = verifyInvitationEnv(process.env);
  const acceptanceUrl = buildInvitationAcceptanceUrl({
    appBaseUrl: invitationEnv.appBaseUrl,
    secret,
  });

  const emailServiceResponse = await sendInvitationEmail({
    invitationId: persistedInvitation.invitationId,
    acceptanceUrl,
    invitedEmail: invitation.invitedEmailNormalized as EmailAddress,
  });

  await handleInvitationSendResponseWorkflow({
    invitationId: persistedInvitation.invitationId,
    emailServiceResponse,
    now,
  });
}

/**
 * @contract copyInvitationLink (Contract 8.6)
 *
 * Server action. Rotates the authoritative invitation secret and returns the
 * latest acceptance URL for a still-open invitation without sending email.
 *
 * @throws CollaboratorManagementPermissionDeniedError if actorId is not an owner of the list.
 */
export async function copyInvitationLink(input: {
  invitationId: InvitationId;
  actorId?: UserId;
  now?: Date;
}): Promise<{ acceptanceUrl: string }> {
  const db = drizzle(sql);
  const now = input.now ?? new Date();
  const actorId = await requireInvitationActionActorId(input.actorId);

  const [invitation] = await db
    .select({
      id: InvitationsTable.id,
      listId: InvitationsTable.listId,
      invitedEmailNormalized: InvitationsTable.invitedEmailNormalized,
      status: InvitationsTable.status,
    })
    .from(InvitationsTable)
    .where(eq(InvitationsTable.id, input.invitationId))
    .limit(1);

  if (!invitation) {
    throw new Error(`Invitation ${String(input.invitationId)} not found`);
  }

  if (!invitation.invitedEmailNormalized) {
    throw new Error(
      `Invitation ${String(input.invitationId)} has no invited email`,
    );
  }

  await assertCanManageCollaborators({
    listId: invitation.listId as List["id"],
    actorId,
  });

  if (invitation.status !== "sent" && invitation.status !== "pending") {
    throw new Error(
      `Invitation ${String(input.invitationId)} cannot provide a copy link from status ${invitation.status}`,
    );
  }

  const secret = createInvitationSecret();
  const secretHash = hashInvitationSecret(secret);

  await issueInvitation({
    listId: invitation.listId as List["id"],
    inviterId: actorId,
    invitedEmail: invitation.invitedEmailNormalized as EmailAddress,
    secretHash,
    now,
  });

  const invitationEnv = verifyInvitationEnv(process.env);

  return {
    acceptanceUrl: buildInvitationAcceptanceUrl({
      appBaseUrl: invitationEnv.appBaseUrl,
      secret,
    }),
  };
}
