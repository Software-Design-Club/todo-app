import { sql as pgSql } from "@vercel/postgres";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { ListCollaboratorsTable } from "@/drizzle/schema";
import { INVITATION_STATUS } from "@/lib/invitations/constants";
import type { InvitationStatus, InviteToken, List, ListInvitation, User } from "@/lib/types";
import {
  createTaggedInvitedEmailNormalized,
  createTaggedListInvitation,
} from "@/lib/types";
import {
  generateInvitationToken,
  getInvitationExpiry,
  hashInvitationToken,
  isInvitationExpired,
} from "./token";

const OPEN_INVITATION_STATUSES: InvitationStatus[] = [
  INVITATION_STATUS.SENT,
  INVITATION_STATUS.PENDING_APPROVAL,
];

const ALL_INVITATION_STATUSES: InvitationStatus[] = [
  INVITATION_STATUS.SENT,
  INVITATION_STATUS.ACCEPTED,
  INVITATION_STATUS.PENDING_APPROVAL,
  INVITATION_STATUS.REVOKED,
  INVITATION_STATUS.EXPIRED,
];

type InvitationInsert = Omit<
  typeof ListCollaboratorsTable.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>;

type InvitationUpdate = Partial<Omit<InvitationInsert, "listId">>;
type InvitationEmail = NonNullable<ListInvitation["invitedEmailNormalized"]>;
type InvitationTokenHash = NonNullable<ListInvitation["inviteTokenHash"]>;
type InvitationEmailDeliveryProviderId = NonNullable<
  ListInvitation["emailDeliveryProviderId"]
>;

export interface InvitationRepository {
  findOpenByEmail(
    listId: List["id"],
    invitedEmailNormalized: InvitationEmail
  ): Promise<ListInvitation | null>;
  findAcceptedByEmail(
    listId: List["id"],
    invitedEmailNormalized: InvitationEmail
  ): Promise<ListInvitation | null>;
  findById(
    invitationId: ListInvitation["id"],
    listId: List["id"]
  ): Promise<ListInvitation | null>;
  findByTokenHash(tokenHash: InvitationTokenHash): Promise<ListInvitation | null>;
  findByEmailDeliveryProviderId(
    providerId: InvitationEmailDeliveryProviderId
  ): Promise<ListInvitation | null>;
  createInvitation(values: InvitationInsert): Promise<ListInvitation>;
  upsertOpenInvitation(
    values: InvitationInsert,
    updateValues: InvitationUpdate
  ): Promise<{ invitation: ListInvitation; reusedExistingRow: boolean }>;
  updateInvitation(
    invitationId: ListInvitation["id"],
    values: InvitationUpdate
  ): Promise<ListInvitation | null>;
  updateInvitationOptimistic(
    invitationId: ListInvitation["id"],
    values: InvitationUpdate,
    conditions: {
      tokenHash: InvitationTokenHash;
      status: InvitationStatus;
    }
  ): Promise<ListInvitation | null>;
  updateOpenInvitations(
    listId: List["id"],
    values: InvitationUpdate
  ): Promise<ListInvitation[]>;
  listInvitationsByStatus(
    listId: List["id"],
    statuses: InvitationStatus[]
  ): Promise<ListInvitation[]>;
  listInvitationsByListIds(
    listIds: List["id"][],
    statuses: InvitationStatus[]
  ): Promise<ListInvitation[]>;
}

type DatabaseClient = ReturnType<typeof drizzle>;

class DrizzleInvitationRepository implements InvitationRepository {
  constructor(private db: DatabaseClient) {}

  async findOpenByEmail(
    listId: List["id"],
    invitedEmailNormalized: InvitationEmail
  ): Promise<ListInvitation | null> {
    const [row] = await this.db
      .select()
      .from(ListCollaboratorsTable)
      .where(
        and(
          eq(ListCollaboratorsTable.listId, listId),
          eq(ListCollaboratorsTable.invitedEmailNormalized, invitedEmailNormalized),
          inArray(ListCollaboratorsTable.inviteStatus, OPEN_INVITATION_STATUSES)
        )
      )
      .limit(1);

    return row ? createTaggedListInvitation(row) : null;
  }

  async findAcceptedByEmail(
    listId: List["id"],
    invitedEmailNormalized: InvitationEmail
  ): Promise<ListInvitation | null> {
    const [row] = await this.db
      .select()
      .from(ListCollaboratorsTable)
      .where(
        and(
          eq(ListCollaboratorsTable.listId, listId),
          eq(ListCollaboratorsTable.invitedEmailNormalized, invitedEmailNormalized),
          eq(ListCollaboratorsTable.inviteStatus, INVITATION_STATUS.ACCEPTED)
        )
      )
      .limit(1);

    return row ? createTaggedListInvitation(row) : null;
  }

  async findById(
    invitationId: ListInvitation["id"],
    listId: List["id"]
  ): Promise<ListInvitation | null> {
    const [row] = await this.db
      .select()
      .from(ListCollaboratorsTable)
      .where(
        and(
          eq(ListCollaboratorsTable.id, invitationId),
          eq(ListCollaboratorsTable.listId, listId)
        )
      )
      .limit(1);

    return row ? createTaggedListInvitation(row) : null;
  }

  async findByTokenHash(tokenHash: InvitationTokenHash): Promise<ListInvitation | null> {
    const [row] = await this.db
      .select()
      .from(ListCollaboratorsTable)
      .where(eq(ListCollaboratorsTable.inviteTokenHash, tokenHash))
      .limit(1);

    return row ? createTaggedListInvitation(row) : null;
  }

  async findByEmailDeliveryProviderId(
    providerId: InvitationEmailDeliveryProviderId
  ): Promise<ListInvitation | null> {
    const [row] = await this.db
      .select()
      .from(ListCollaboratorsTable)
      .where(eq(ListCollaboratorsTable.emailDeliveryProviderId, providerId))
      .limit(1);

    return row ? createTaggedListInvitation(row) : null;
  }

  async createInvitation(values: InvitationInsert): Promise<ListInvitation> {
    const [created] = await this.db
      .insert(ListCollaboratorsTable)
      .values(values)
      .returning();

    if (!created) {
      throw new Error("Failed to create invitation.");
    }

    return createTaggedListInvitation(created);
  }

  async upsertOpenInvitation(
    values: InvitationInsert,
    updateValues: InvitationUpdate
  ): Promise<{ invitation: ListInvitation; reusedExistingRow: boolean }> {
    const invitedEmailNormalized = values.invitedEmailNormalized as
      | InvitationEmail
      | null;
    if (!invitedEmailNormalized) {
      throw new Error("Cannot upsert invitation without an invited email.");
    }

    const existingOpenInvite = await this.findOpenByEmail(
      values.listId as List["id"],
      invitedEmailNormalized
    );

    const [row] = await this.db
      .insert(ListCollaboratorsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          ListCollaboratorsTable.listId,
          ListCollaboratorsTable.invitedEmailNormalized,
        ],
        targetWhere: sql`${ListCollaboratorsTable.inviteStatus} IN ('sent', 'pending_approval') AND ${ListCollaboratorsTable.invitedEmailNormalized} IS NOT NULL`,
        set: {
          ...updateValues,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert invitation.");
    }

    return {
      invitation: createTaggedListInvitation(row),
      reusedExistingRow: Boolean(existingOpenInvite),
    };
  }

  async updateInvitation(
    invitationId: ListInvitation["id"],
    values: InvitationUpdate
  ): Promise<ListInvitation | null> {
    const [updated] = await this.db
      .update(ListCollaboratorsTable)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(eq(ListCollaboratorsTable.id, invitationId))
      .returning();

    return updated ? createTaggedListInvitation(updated) : null;
  }

  async updateInvitationOptimistic(
    invitationId: ListInvitation["id"],
    values: InvitationUpdate,
    conditions: {
      tokenHash: InvitationTokenHash;
      status: InvitationStatus;
    }
  ): Promise<ListInvitation | null> {
    const [updated] = await this.db
      .update(ListCollaboratorsTable)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ListCollaboratorsTable.id, invitationId),
          eq(ListCollaboratorsTable.inviteTokenHash, conditions.tokenHash),
          eq(ListCollaboratorsTable.inviteStatus, conditions.status)
        )
      )
      .returning();

    return updated ? createTaggedListInvitation(updated) : null;
  }

  async updateOpenInvitations(
    listId: List["id"],
    values: InvitationUpdate
  ): Promise<ListInvitation[]> {
    const rows = await this.db
      .update(ListCollaboratorsTable)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ListCollaboratorsTable.listId, listId),
          inArray(ListCollaboratorsTable.inviteStatus, OPEN_INVITATION_STATUSES)
        )
      )
      .returning();

    return rows.map(createTaggedListInvitation);
  }

  async listInvitationsByStatus(
    listId: List["id"],
    statuses: InvitationStatus[]
  ): Promise<ListInvitation[]> {
    if (statuses.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(ListCollaboratorsTable)
      .where(
        and(
          eq(ListCollaboratorsTable.listId, listId),
          inArray(ListCollaboratorsTable.inviteStatus, statuses)
        )
      )
      .orderBy(desc(ListCollaboratorsTable.updatedAt));

    return rows.map(createTaggedListInvitation);
  }

  async listInvitationsByListIds(
    listIds: List["id"][],
    statuses: InvitationStatus[]
  ): Promise<ListInvitation[]> {
    if (listIds.length === 0 || statuses.length === 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(ListCollaboratorsTable)
      .where(
        and(
          inArray(ListCollaboratorsTable.listId, listIds),
          inArray(ListCollaboratorsTable.inviteStatus, statuses)
        )
      )
      .orderBy(desc(ListCollaboratorsTable.updatedAt));

    return rows.map(createTaggedListInvitation);
  }
}

function normalizeEmail(email: string): InvitationEmail {
  return createTaggedInvitedEmailNormalized(email.trim().toLowerCase());
}

function getRepository(repo?: InvitationRepository): InvitationRepository {
  return repo ?? new DrizzleInvitationRepository(drizzle(pgSql));
}

export interface UpsertInvitationParams {
  listId: List["id"];
  inviterId: User["id"];
  invitedEmail: string;
}

export interface UpsertInvitationResult {
  invitation: ListInvitation;
  inviteToken: InviteToken;
  reusedExistingRow: boolean;
}

export async function createOrRotateInvitation(
  params: UpsertInvitationParams,
  repo?: InvitationRepository
): Promise<UpsertInvitationResult> {
  const invitationRepo = getRepository(repo);
  const now = new Date();
  const invitedEmailNormalized = normalizeEmail(params.invitedEmail);

  const existingAccepted = await invitationRepo.findAcceptedByEmail(
    params.listId,
    invitedEmailNormalized
  );
  if (existingAccepted) {
    throw new Error(
      "This email is already an accepted collaborator on this list."
    );
  }

  const { token: inviteToken, tokenHash } = generateInvitationToken();
  const inviteExpiresAt = getInvitationExpiry(now);

  const updateValues: InvitationUpdate = {
    userId: null,
    role: "collaborator",
    inviteStatus: INVITATION_STATUS.SENT,
    invitedEmailNormalized,
    inviteTokenHash: tokenHash,
    inviteExpiresAt,
    inviterId: params.inviterId,
    inviteSentAt: now,
    inviteAcceptedAt: null,
    inviteRevokedAt: null,
    inviteExpiredAt: null,
    invitationApprovalRequestedAt: null,
    invitationApprovedBy: null,
    invitationApprovedAt: null,
    invitationRejectedBy: null,
    invitationRejectedAt: null,
    emailDeliveryStatus: null,
    emailDeliveryError: null,
    emailDeliveryProviderId: null,
    emailLastSentAt: null,
  };

  const insertValues: InvitationInsert = {
    listId: params.listId,
    ...updateValues,
  };

  const { invitation, reusedExistingRow } = await invitationRepo.upsertOpenInvitation(
    insertValues,
    updateValues
  );

  return {
    invitation,
    inviteToken,
    reusedExistingRow,
  };
}

export async function resendInvitation(
  params: {
    invitationId: ListInvitation["id"];
    listId: List["id"];
    inviterId: User["id"];
  },
  repo?: InvitationRepository
): Promise<{ invitation: ListInvitation; inviteToken: InviteToken }> {
  const invitationRepo = getRepository(repo);
  const now = new Date();
  const existingInvite = await invitationRepo.findById(
    params.invitationId,
    params.listId
  );

  if (!existingInvite) {
    throw new Error("Invitation not found.");
  }
  if (!OPEN_INVITATION_STATUSES.includes(existingInvite.inviteStatus)) {
    throw new Error("Only open invitations can be resent.");
  }

  const invitedEmailNormalized = existingInvite.invitedEmailNormalized;
  if (!invitedEmailNormalized) {
    throw new Error("Cannot resend invitation without an invited email.");
  }

  const { token: inviteToken, tokenHash } = generateInvitationToken();
  const updatedInvite = await invitationRepo.updateInvitation(params.invitationId, {
    userId: null,
    inviteStatus: INVITATION_STATUS.SENT,
    inviterId: params.inviterId,
    inviteTokenHash: tokenHash,
    inviteExpiresAt: getInvitationExpiry(now),
    inviteSentAt: now,
    inviteAcceptedAt: null,
    inviteRevokedAt: null,
    inviteExpiredAt: null,
    invitationApprovalRequestedAt: null,
    invitationApprovedBy: null,
    invitationApprovedAt: null,
    invitationRejectedBy: null,
    invitationRejectedAt: null,
    emailDeliveryStatus: null,
    emailDeliveryError: null,
    emailDeliveryProviderId: null,
    emailLastSentAt: null,
  });

  if (!updatedInvite) {
    throw new Error("Failed to resend invitation.");
  }

  return {
    invitation: updatedInvite,
    inviteToken,
  };
}

export async function revokeInvitation(
  params: {
    invitationId: ListInvitation["id"];
    listId: List["id"];
  },
  repo?: InvitationRepository
): Promise<ListInvitation> {
  const invitationRepo = getRepository(repo);
  const now = new Date();
  const existingInvite = await invitationRepo.findById(
    params.invitationId,
    params.listId
  );

  if (!existingInvite) {
    throw new Error("Invitation not found.");
  }

  if (!OPEN_INVITATION_STATUSES.includes(existingInvite.inviteStatus)) {
    throw new Error("Only open invitations can be revoked.");
  }

  const updatedInvite = await invitationRepo.updateInvitation(params.invitationId, {
    inviteStatus: INVITATION_STATUS.REVOKED,
    inviteTokenHash: null,
    inviteExpiresAt: null,
    inviteRevokedAt: now,
  });

  if (!updatedInvite) {
    throw new Error("Failed to revoke invitation.");
  }

  return updatedInvite;
}

export async function approvePendingOwnerInvitation(
  params: {
    invitationId: ListInvitation["id"];
    listId: List["id"];
    ownerId: User["id"];
  },
  repo?: InvitationRepository
): Promise<ListInvitation> {
  const invitationRepo = getRepository(repo);
  const now = new Date();
  const invite = await invitationRepo.findById(params.invitationId, params.listId);

  if (!invite) {
    throw new Error("Invitation not found.");
  }
  if (invite.inviteStatus !== INVITATION_STATUS.PENDING_APPROVAL) {
    throw new Error("Invitation is not pending owner approval.");
  }
  if (!invite.userId) {
    throw new Error("Cannot approve without a recipient user.");
  }

  const updated = await invitationRepo.updateInvitation(params.invitationId, {
    inviteStatus: INVITATION_STATUS.ACCEPTED,
    inviteAcceptedAt: now,
    inviteTokenHash: null,
    inviteExpiresAt: null,
    invitationApprovedBy: params.ownerId,
    invitationApprovedAt: now,
    invitationRejectedBy: null,
    invitationRejectedAt: null,
  });

  if (!updated) {
    throw new Error("Failed to approve invitation.");
  }

  return updated;
}

export async function rejectPendingOwnerInvitation(
  params: {
    invitationId: ListInvitation["id"];
    listId: List["id"];
    ownerId: User["id"];
  },
  repo?: InvitationRepository
): Promise<ListInvitation> {
  const invitationRepo = getRepository(repo);
  const now = new Date();
  const invite = await invitationRepo.findById(params.invitationId, params.listId);

  if (!invite) {
    throw new Error("Invitation not found.");
  }
  if (invite.inviteStatus !== INVITATION_STATUS.PENDING_APPROVAL) {
    throw new Error("Invitation is not pending owner approval.");
  }

  const updated = await invitationRepo.updateInvitation(params.invitationId, {
    inviteStatus: INVITATION_STATUS.REVOKED,
    inviteTokenHash: null,
    inviteExpiresAt: null,
    inviteRevokedAt: now,
    invitationRejectedBy: params.ownerId,
    invitationRejectedAt: now,
  });

  if (!updated) {
    throw new Error("Failed to reject invitation.");
  }

  return updated;
}

export async function listInvitationsForList(
  params: {
    listId: List["id"];
    statuses?: InvitationStatus[];
  },
  repo?: InvitationRepository
): Promise<ListInvitation[]> {
  const invitationRepo = getRepository(repo);
  const statuses = params.statuses ?? ALL_INVITATION_STATUSES;
  const invitations = await invitationRepo.listInvitationsByStatus(
    params.listId,
    statuses
  );
  return invitations;
}

export async function listInvitationsForLists(
  params: {
    listIds: List["id"][];
    statuses?: InvitationStatus[];
  },
  repo?: InvitationRepository
): Promise<Map<List["id"], ListInvitation[]>> {
  const invitationRepo = getRepository(repo);
  const statuses = params.statuses ?? ALL_INVITATION_STATUSES;
  const invitations = await invitationRepo.listInvitationsByListIds(
    params.listIds,
    statuses
  );

  const result = new Map<List["id"], ListInvitation[]>();
  for (const invitation of invitations) {
    const listInvitations = result.get(invitation.listId) ?? [];
    listInvitations.push(invitation);
    result.set(invitation.listId, listInvitations);
  }

  return result;
}

export async function getInvitationByIdForList(
  params: {
    listId: List["id"];
    invitationId: ListInvitation["id"];
  },
  repo?: InvitationRepository
): Promise<ListInvitation | null> {
  const invitationRepo = getRepository(repo);
  const invitation = await invitationRepo.findById(
    params.invitationId,
    params.listId
  );
  return invitation;
}

export type ConsumeInvitationResult =
  | { status: "invalid" }
  | { status: "revoked" | "expired" | "accepted" | "pending_approval" }
  | { status: "accepted_now"; invitation: ListInvitation }
  | { status: "pending_approval_now"; invitation: ListInvitation };

export async function consumeInvitationToken(
  params: {
    inviteToken: InviteToken;
    userId: User["id"];
    userEmail: string;
  },
  repo?: InvitationRepository
): Promise<ConsumeInvitationResult> {
  const invitationRepo = getRepository(repo);
  const now = new Date();
  const tokenHash = hashInvitationToken(params.inviteToken);
  const invite = await invitationRepo.findByTokenHash(tokenHash);

  if (!invite) {
    return { status: "invalid" };
  }

  if (invite.inviteStatus === INVITATION_STATUS.REVOKED) {
    return { status: "revoked" };
  }
  if (invite.inviteStatus === INVITATION_STATUS.ACCEPTED) {
    return { status: "accepted" };
  }
  if (invite.inviteStatus === INVITATION_STATUS.PENDING_APPROVAL) {
    return { status: "pending_approval" };
  }
  if (invite.inviteStatus === INVITATION_STATUS.EXPIRED) {
    return { status: "expired" };
  }

  if (isInvitationExpired(invite.inviteExpiresAt, now)) {
    await invitationRepo.updateInvitation(invite.id, {
      inviteStatus: INVITATION_STATUS.EXPIRED,
      inviteTokenHash: null,
      inviteExpiredAt: now,
    });

    return { status: "expired" };
  }

  const inviteEmail = invite.invitedEmailNormalized;
  if (!inviteEmail) {
    return { status: "invalid" };
  }
  const currentTokenHash = invite.inviteTokenHash;
  if (!currentTokenHash) {
    return { status: "invalid" };
  }

  const normalizedUserEmail = normalizeEmail(params.userEmail);
  const status: InvitationStatus =
    normalizedUserEmail === inviteEmail
      ? INVITATION_STATUS.ACCEPTED
      : INVITATION_STATUS.PENDING_APPROVAL;

  const updated = await invitationRepo.updateInvitationOptimistic(
    invite.id,
    {
      userId: params.userId,
      inviteStatus: status,
      inviteTokenHash: null,
      inviteExpiresAt: null,
      inviteAcceptedAt: status === INVITATION_STATUS.ACCEPTED ? now : null,
      invitationApprovalRequestedAt:
        status === INVITATION_STATUS.PENDING_APPROVAL ? now : null,
    },
    {
      tokenHash: currentTokenHash,
      status: invite.inviteStatus,
    }
  );

  if (!updated) {
    return { status: "invalid" };
  }

  if (status === INVITATION_STATUS.ACCEPTED) {
    return {
      status: "accepted_now",
      invitation: updated,
    };
  }

  return {
    status: "pending_approval_now",
    invitation: updated,
  };
}

export async function updateInvitationEmailDeliveryStatus(
  params: {
    status: "sent" | "failed";
    errorMessage: string | null;
    repo?: InvitationRepository;
  } & (
    | { invitationId: ListInvitation["id"]; providerId?: ListInvitation["emailDeliveryProviderId"] }
    | { providerId: InvitationEmailDeliveryProviderId; invitationId?: ListInvitation["id"] }
  )
): Promise<ListInvitation | null> {
  const invitationRepo = getRepository(params.repo);
  const now = new Date();

  let invitationId: ListInvitation["id"];
  let providerId: ListInvitation["emailDeliveryProviderId"] | null = null;

  if ("invitationId" in params && params.invitationId) {
    invitationId = params.invitationId;
    if ("providerId" in params && params.providerId) {
      providerId = params.providerId;
    }
  } else if ("providerId" in params && params.providerId) {
    const existing = await invitationRepo.findByEmailDeliveryProviderId(params.providerId);
    if (!existing) {
      return null;
    }
    invitationId = existing.id;
    providerId = params.providerId;
  } else {
    throw new Error("Either invitationId or providerId must be provided.");
  }

  const updated = await invitationRepo.updateInvitation(invitationId, {
    emailDeliveryStatus: params.status,
    emailDeliveryProviderId: providerId,
    emailDeliveryError: params.errorMessage,
    emailLastSentAt: now,
  });

  return updated ?? null;
}

export async function revokeOpenInvitationsForList(
  params: {
    listId: List["id"];
  },
  repo?: InvitationRepository
): Promise<ListInvitation[]> {
  const invitationRepo = getRepository(repo);
  const now = new Date();
  const updated = await invitationRepo.updateOpenInvitations(params.listId, {
    inviteStatus: INVITATION_STATUS.REVOKED,
    inviteTokenHash: null,
    inviteExpiresAt: null,
    inviteRevokedAt: now,
  });

  return updated;
}
