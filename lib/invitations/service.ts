import { sql } from "@vercel/postgres";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";

import { InvitationsTable, ListCollaboratorsTable, ListsTable, UsersTable } from "@/drizzle/schema";
import { sendInvitationEmail, type EmailServiceSendResponse } from "@/lib/email/service";
import { ListNotFoundError } from "@/lib/errors";
import { verifyInvitationEnv } from "@/lib/invitations/env";
import { buildInviteContinuationTarget } from "@/lib/invitations/redirect";
import { assertCanInviteCollaborators } from "@/app/lists/_actions/permissions";
import {
  type AbsoluteInvitationUrl,
  type AcceptInvitationWorkflowResult,
  type AcceptedCollaborator,
  type ActorCollaboratorCapabilities,
  type AppBaseUrl,
  type AuthenticatedDeliveryEventResult,
  type AuthenticatedUser,
  type CollaboratorManagementViewData,
  type EmailAddress,
  type EmailServiceDeliveryEvent,
  type InvitationDeliveryResult,
  type InvitationExpiry,
  type InvitationId,
  type InvitationSecret,
  type InvitationSecretHash,
  type InvitationSummary,
  type List,
  type ListId,
  type ListWithRole,
  type NormalizedEmailAddress,
  type PendingApprovalInvitationAction,
  type PendingApprovalInvitationSummary,
  type ResolveInviteAcceptanceResult,
  type SentInvitationAction,
  type SentInvitationSummary,
  type SentInvitationStatus,
  type User,
  type UserRole,
  type UserId,
} from "@/lib/types";
import {
  createInvitationSecret,
  hashInvitationSecret,
} from "@/lib/invitations/token";

const OPEN_INVITATION_STATUSES = ["pending", "sent"] as const;
const MANAGEABLE_INVITATION_STATUSES = ["pending", "sent", "pending_approval"] as const;
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
 * - After sending email, records the delivery outcome (providerMessageId or error)
 *   via handleInvitationSendResponseWorkflow.
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
    invitedEmail: input.invitedEmail,
  });

  await handleInvitationSendResponseWorkflow({
    invitationId: persistedInvitation.invitationId,
    emailServiceResponse,
    now: input.now,
  });

  return {
    invitationId: persistedInvitation.invitationId,
    acceptanceUrl,
    emailServiceResponse,
  };
}

/**
 * @contract normalizeEmailServiceSendResponse (5.3)
 *
 * Pure function. Maps a generic EmailServiceSendResponse into an
 * InvitationDeliveryResult for persistence.
 */
export function normalizeEmailServiceSendResponse(
  response: EmailServiceSendResponse,
): InvitationDeliveryResult {
  if (response.kind === "accepted") {
    return {
      kind: "accepted_for_delivery",
      providerMessageId: response.providerMessageId,
    };
  }

  return {
    kind: "send_failed",
    providerErrorMessage: response.errorMessage,
    providerErrorName: response.errorName,
  };
}

/**
 * @contract recordInvitationSendResult (5.4)
 *
 * DB update. Updates delivery-tracking columns on the invitations row
 * based on the normalized delivery result.
 */
export async function recordInvitationSendResult(input: {
  invitationId: InvitationId;
  result: InvitationDeliveryResult;
  now: Date;
}): Promise<void> {
  const db = drizzle(sql);

  if (input.result.kind === "accepted_for_delivery") {
    await db
      .update(InvitationsTable)
      .set({
        providerMessageId: input.result.providerMessageId,
        lastDeliveryAttemptAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(InvitationsTable.id, input.invitationId));
  } else {
    const errorParts: string[] = [];
    if (input.result.providerErrorName) {
      errorParts.push(input.result.providerErrorName as string);
    }
    errorParts.push(input.result.providerErrorMessage as string);

    await db
      .update(InvitationsTable)
      .set({
        lastDeliveryError: errorParts.join(": "),
        lastDeliveryAttemptAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(InvitationsTable.id, input.invitationId));
  }
}

/**
 * @contract handleInvitationSendResponseWorkflow (5.1)
 *
 * Combines normalizeEmailServiceSendResponse (5.3) and
 * recordInvitationSendResult (5.4). Normalizes the email service
 * response then persists the delivery outcome.
 */
export async function handleInvitationSendResponseWorkflow(input: {
  invitationId: InvitationId;
  emailServiceResponse: EmailServiceSendResponse;
  now: Date;
}): Promise<InvitationDeliveryResult> {
  const deliveryResult = normalizeEmailServiceSendResponse(
    input.emailServiceResponse,
  );

  await recordInvitationSendResult({
    invitationId: input.invitationId,
    result: deliveryResult,
    now: input.now,
  });

  return deliveryResult;
}

/**
 * @contract recordInvitationDeliveryEvent (5.6)
 *
 * DB update for webhook events. Updates deliveryEventType, providerRawEventType,
 * and providerEventReceivedAt when correlatable by providerMessageId.
 * Returns "updated" when a matching invitation row was found and updated,
 * or "ignored" otherwise.
 */
export async function recordInvitationDeliveryEvent(
  event: EmailServiceDeliveryEvent,
): Promise<"updated" | "ignored"> {
  if (event.kind === "ignored") {
    return "ignored";
  }

  const db = drizzle(sql);

  const result = await db
    .update(InvitationsTable)
    .set({
      deliveryEventType: event.deliveryEventType,
      providerRawEventType: event.providerRawEventType,
      providerEventReceivedAt: event.receivedAt,
      updatedAt: event.receivedAt as unknown as Date,
    })
    .where(eq(InvitationsTable.providerMessageId, event.providerMessageId))
    .returning({ id: InvitationsTable.id });

  return result.length > 0 ? "updated" : "ignored";
}

/**
 * @contract handleAuthenticatedEmailProviderEventWorkflow (5.2)
 *
 * Delegates to recordInvitationDeliveryEvent and returns
 * an AuthenticatedDeliveryEventResult.
 */
export async function handleAuthenticatedEmailProviderEventWorkflow(
  event: EmailServiceDeliveryEvent,
): Promise<AuthenticatedDeliveryEventResult> {
  const persistence = await recordInvitationDeliveryEvent(event);

  return {
    deliveryEventType:
      event.kind === "delivery_reported" ? event.deliveryEventType : null,
    providerRawEventType: event.providerRawEventType,
    persistence,
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

// ─── Phase 8: Collaborator Management Contracts ────────────────────────────

/**
 * @contract getAvailableInvitationActions (Contract 8.4)
 *
 * Returns only actions valid for the invitation's current state and actor capabilities.
 * - For sent invitations: resend, revoke, copy_link (when actor has capability)
 * - For pending_approval invitations: approve, reject (when actor has capability)
 * Does not include actions the actor is not allowed to perform.
 */
export function getAvailableInvitationActions<TInvitation extends InvitationSummary>(input: {
  invitation: TInvitation;
  actorCapabilities: ActorCollaboratorCapabilities;
}): ReadonlyArray<TInvitation extends PendingApprovalInvitationSummary ? PendingApprovalInvitationAction : SentInvitationAction> {
  const { invitation, actorCapabilities } = input;

  if (invitation.kind === "pending_approval") {
    const actions: PendingApprovalInvitationAction[] = [];
    if (actorCapabilities.canApprove) {
      actions.push({ kind: "approve", invitationId: invitation.invitationId });
    }
    if (actorCapabilities.canReject) {
      actions.push({ kind: "reject", invitationId: invitation.invitationId });
    }
    return actions as unknown as ReadonlyArray<TInvitation extends PendingApprovalInvitationSummary ? PendingApprovalInvitationAction : SentInvitationAction>;
  }

  // sent invitation
  const actions: SentInvitationAction[] = [];
  if (actorCapabilities.canResend) {
    actions.push({ kind: "resend", invitationId: invitation.invitationId });
  }
  if (actorCapabilities.canRevoke) {
    actions.push({ kind: "revoke", invitationId: invitation.invitationId });
  }
  if (actorCapabilities.canCopyLink) {
    actions.push({ kind: "copy_link", invitationId: invitation.invitationId });
  }
  return actions as unknown as ReadonlyArray<TInvitation extends PendingApprovalInvitationSummary ? PendingApprovalInvitationAction : SentInvitationAction>;
}

/**
 * @contract getCollaboratorManagementViewData (Contract 8.3)
 *
 * Returns all lists, accepted collaborators, open invites, and pending_approval
 * entries manageable by actorId. Uses two parallel queries — one to list_collaborators,
 * one to invitations filtered by status IN ('pending', 'sent', 'pending_approval').
 * Does NOT perform one query per list.
 * For pending_approval invitations, includes acceptedByEmail and acceptedByUserId.
 */
export async function getCollaboratorManagementViewData(input: {
  actorId: User["id"];
}): Promise<CollaboratorManagementViewData> {
  const db = drizzle(sql);

  // Step 1: Find all lists where actorId is an owner
  const ownedListRows = await db
    .select({
      listId: ListCollaboratorsTable.listId,
      listTitle: ListsTable.title,
      listCreatorId: ListsTable.creatorId,
      listVisibility: ListsTable.visibility,
      listState: ListsTable.state,
      listCreatedAt: ListsTable.createdAt,
      listUpdatedAt: ListsTable.updatedAt,
    })
    .from(ListCollaboratorsTable)
    .innerJoin(ListsTable, eq(ListCollaboratorsTable.listId, ListsTable.id))
    .where(
      and(
        eq(ListCollaboratorsTable.userId, input.actorId),
        eq(ListCollaboratorsTable.role, "owner"),
      ),
    );

  if (ownedListRows.length === 0) {
    return { manageableLists: [] };
  }

  const ownedListIds = ownedListRows.map((row) => row.listId);

  // Step 2: Two parallel queries — collaborators and open/pending_approval invitations
  const [collaboratorRows, invitationRows] = await Promise.all([
    db
      .select({
        listId: ListCollaboratorsTable.listId,
        userId: UsersTable.id,
        userName: UsersTable.name,
        userEmail: UsersTable.email,
        role: ListCollaboratorsTable.role,
      })
      .from(ListCollaboratorsTable)
      .innerJoin(UsersTable, eq(ListCollaboratorsTable.userId, UsersTable.id))
      .where(inArray(ListCollaboratorsTable.listId, ownedListIds)),
    db
      .select({
        id: InvitationsTable.id,
        listId: InvitationsTable.listId,
        status: InvitationsTable.status,
        invitedEmailNormalized: InvitationsTable.invitedEmailNormalized,
        expiresAt: InvitationsTable.expiresAt,
        acceptedByUserId: InvitationsTable.acceptedByUserId,
        acceptedByEmail: InvitationsTable.acceptedByEmail,
      })
      .from(InvitationsTable)
      .where(
        and(
          inArray(InvitationsTable.listId, ownedListIds),
          inArray(InvitationsTable.status, [...MANAGEABLE_INVITATION_STATUSES]),
        ),
      ),
  ]);

  // Step 3: Group collaborators and invitations by listId
  const collaboratorsByListId = new Map<number, AcceptedCollaborator[]>();
  for (const row of collaboratorRows) {
    const existing = collaboratorsByListId.get(row.listId) ?? [];
    existing.push({
      userId: row.userId as UserId,
      name: row.userName as User["name"],
      email: row.userEmail as User["email"],
      role: row.role as UserRole,
    });
    collaboratorsByListId.set(row.listId, existing);
  }

  const invitationsByListId = new Map<number, InvitationSummary[]>();
  for (const row of invitationRows) {
    const existing = invitationsByListId.get(row.listId) ?? [];

    if (row.status === "pending_approval") {
      if (row.invitedEmailNormalized && row.expiresAt && row.acceptedByUserId) {
        const summary: InvitationSummary = {
          kind: "pending_approval",
          invitationId: row.id as InvitationId,
          listId: row.listId as ListId,
          invitedEmailNormalized: row.invitedEmailNormalized as NormalizedEmailAddress,
          expiresAt: row.expiresAt as InvitationExpiry,
          acceptedByUserId: row.acceptedByUserId as UserId,
          acceptedByEmail: row.acceptedByEmail as NormalizedEmailAddress | null,
        };
        existing.push(summary);
      }
    } else {
      // sent or pending
      if (row.invitedEmailNormalized && row.expiresAt) {
        const summary: SentInvitationSummary = {
          kind: "sent",
          invitationId: row.id as InvitationId,
          listId: row.listId as ListId,
          invitedEmailNormalized: row.invitedEmailNormalized as NormalizedEmailAddress,
          expiresAt: row.expiresAt as InvitationExpiry,
        };
        existing.push(summary);
      }
    }
    invitationsByListId.set(row.listId, existing);
  }

  // Step 4: Build view data
  const manageableLists = ownedListRows.map((listRow) => {
    const list: ListWithRole = {
      id: listRow.listId as List["id"],
      title: listRow.listTitle as List["title"],
      creatorId: listRow.listCreatorId as List["creatorId"],
      visibility: listRow.listVisibility as List["visibility"],
      state: listRow.listState as List["state"],
      createdAt: listRow.listCreatedAt as List["createdAt"],
      updatedAt: listRow.listUpdatedAt as List["updatedAt"],
      userRole: "owner" as UserRole,
    };

    return {
      list,
      acceptedCollaborators: collaboratorsByListId.get(listRow.listId) ?? [],
      invitations: invitationsByListId.get(listRow.listId) ?? [],
    };
  });

  return { manageableLists };
}

/**
 * @contract loadCollaboratorManagementWorkflow (Contract 8.1)
 *
 * Loads the data needed to render collaborator management views.
 * Returns accepted collaborators, open invites, and pending_approval entries for
 * lists where actorId is allowed to manage collaborators.
 * Excludes lists where actorId is not allowed.
 */
export async function loadCollaboratorManagementWorkflow(input: {
  actorId: User["id"];
}): Promise<CollaboratorManagementViewData> {
  return getCollaboratorManagementViewData({ actorId: input.actorId });
}
