import { sql } from "@vercel/postgres";
import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { InvitationStatusEnum, ListCollaboratorsTable } from "@/drizzle/schema";
import type { InvitationStatus, List, ListInvitation, User } from "@/lib/types";
import { createTaggedListInvitation } from "@/lib/types";
import {
  generateInvitationToken,
  getInvitationExpiry,
  hashInvitationToken,
  isInvitationExpired,
} from "./token";

const OPEN_INVITATION_STATUSES: InvitationStatus[] = [
  "sent",
  "pending_owner_approval",
];

type InvitationRow = typeof ListCollaboratorsTable.$inferSelect;

type InvitationInsert = Omit<
  typeof ListCollaboratorsTable.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>;

type InvitationUpdate = Partial<Omit<InvitationInsert, "listId">>;

export interface InvitationRepository {
  findOpenByEmail(
    listId: List["id"],
    invitedEmailNormalized: string
  ): Promise<InvitationRow | null>;
  findById(
    invitationId: ListInvitation["id"],
    listId: List["id"]
  ): Promise<InvitationRow | null>;
  findByTokenHash(tokenHash: string): Promise<InvitationRow | null>;
  findByEmailDeliveryProviderId(providerId: string): Promise<InvitationRow | null>;
  createInvitation(values: InvitationInsert): Promise<InvitationRow>;
  updateInvitation(
    invitationId: ListInvitation["id"],
    values: InvitationUpdate
  ): Promise<InvitationRow | null>;
  updateOpenInvitations(
    listId: List["id"],
    values: InvitationUpdate
  ): Promise<InvitationRow[]>;
  listInvitationsByStatus(
    listId: List["id"],
    statuses: InvitationStatus[]
  ): Promise<InvitationRow[]>;
}

class DrizzleInvitationRepository implements InvitationRepository {
  private db = drizzle(sql);

  async findOpenByEmail(
    listId: List["id"],
    invitedEmailNormalized: string
  ): Promise<InvitationRow | null> {
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

    return row ?? null;
  }

  async findById(
    invitationId: ListInvitation["id"],
    listId: List["id"]
  ): Promise<InvitationRow | null> {
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

    return row ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationRow | null> {
    const [row] = await this.db
      .select()
      .from(ListCollaboratorsTable)
      .where(eq(ListCollaboratorsTable.inviteTokenHash, tokenHash))
      .limit(1);

    return row ?? null;
  }

  async findByEmailDeliveryProviderId(
    providerId: string
  ): Promise<InvitationRow | null> {
    const [row] = await this.db
      .select()
      .from(ListCollaboratorsTable)
      .where(eq(ListCollaboratorsTable.emailDeliveryProviderId, providerId))
      .limit(1);

    return row ?? null;
  }

  async createInvitation(values: InvitationInsert): Promise<InvitationRow> {
    const [created] = await this.db
      .insert(ListCollaboratorsTable)
      .values(values)
      .returning();

    if (!created) {
      throw new Error("Failed to create invitation.");
    }

    return created;
  }

  async updateInvitation(
    invitationId: ListInvitation["id"],
    values: InvitationUpdate
  ): Promise<InvitationRow | null> {
    const [updated] = await this.db
      .update(ListCollaboratorsTable)
      .set({
        ...values,
        updatedAt: new Date(),
      })
      .where(eq(ListCollaboratorsTable.id, invitationId))
      .returning();

    return updated ?? null;
  }

  async updateOpenInvitations(
    listId: List["id"],
    values: InvitationUpdate
  ): Promise<InvitationRow[]> {
    return this.db
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
  }

  async listInvitationsByStatus(
    listId: List["id"],
    statuses: InvitationStatus[]
  ): Promise<InvitationRow[]> {
    if (statuses.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(ListCollaboratorsTable)
      .where(
        and(
          eq(ListCollaboratorsTable.listId, listId),
          inArray(ListCollaboratorsTable.inviteStatus, statuses)
        )
      )
      .orderBy(desc(ListCollaboratorsTable.updatedAt));
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getRepository(repo?: InvitationRepository): InvitationRepository {
  return repo ?? new DrizzleInvitationRepository();
}

function toTaggedInvitation(invitation: InvitationRow): ListInvitation {
  return createTaggedListInvitation(invitation);
}

export interface UpsertInvitationParams {
  listId: List["id"];
  inviterId: User["id"];
  invitedEmail: string;
}

export interface UpsertInvitationResult {
  invitation: ListInvitation;
  inviteToken: string;
  reusedExistingRow: boolean;
}

export async function createOrRotateInvitation(
  params: UpsertInvitationParams,
  repo?: InvitationRepository
): Promise<UpsertInvitationResult> {
  const invitationRepo = getRepository(repo);
  const now = new Date();
  const invitedEmailNormalized = normalizeEmail(params.invitedEmail);

  const { token: inviteToken, tokenHash } = generateInvitationToken();
  const inviteExpiresAt = getInvitationExpiry(now);

  const existingOpenInvite = await invitationRepo.findOpenByEmail(
    params.listId,
    invitedEmailNormalized
  );

  const commonValues: InvitationUpdate = {
    userId: null,
    role: "collaborator",
    inviteStatus: InvitationStatusEnum.enumValues[0],
    invitedEmailNormalized,
    inviteTokenHash: tokenHash,
    inviteExpiresAt,
    inviterId: params.inviterId,
    inviteSentAt: now,
    inviteAcceptedAt: null,
    inviteRevokedAt: null,
    inviteExpiredAt: null,
    ownerApprovalRequestedAt: null,
    ownerApprovedBy: null,
    ownerApprovedAt: null,
    ownerRejectedBy: null,
    ownerRejectedAt: null,
    emailDeliveryStatus: null,
    emailDeliveryError: null,
    emailDeliveryProviderId: null,
    emailLastSentAt: null,
  };

  const invitation = existingOpenInvite
    ? await invitationRepo.updateInvitation(existingOpenInvite.id as ListInvitation["id"], commonValues)
    : await invitationRepo.createInvitation({
        ...commonValues,
        listId: params.listId,
      } as InvitationInsert);

  if (!invitation) {
    throw new Error("Failed to upsert invitation.");
  }

  return {
    invitation: toTaggedInvitation(invitation),
    inviteToken,
    reusedExistingRow: Boolean(existingOpenInvite),
  };
}

export async function resendInvitation(
  params: {
    invitationId: ListInvitation["id"];
    listId: List["id"];
    inviterId: User["id"];
  },
  repo?: InvitationRepository
): Promise<{ invitation: ListInvitation; inviteToken: string }> {
  const invitationRepo = getRepository(repo);
  const now = new Date();
  const existingInvite = await invitationRepo.findById(
    params.invitationId,
    params.listId
  );

  if (!existingInvite) {
    throw new Error("Invitation not found.");
  }

  const invitedEmailNormalized = existingInvite.invitedEmailNormalized;
  if (!invitedEmailNormalized) {
    throw new Error("Cannot resend invitation without an invited email.");
  }

  const { token: inviteToken, tokenHash } = generateInvitationToken();
  const updatedInvite = await invitationRepo.updateInvitation(params.invitationId, {
    userId: null,
    inviteStatus: InvitationStatusEnum.enumValues[0],
    inviterId: params.inviterId,
    inviteTokenHash: tokenHash,
    inviteExpiresAt: getInvitationExpiry(now),
    inviteSentAt: now,
    inviteAcceptedAt: null,
    inviteRevokedAt: null,
    inviteExpiredAt: null,
    ownerApprovalRequestedAt: null,
    ownerApprovedBy: null,
    ownerApprovedAt: null,
    ownerRejectedBy: null,
    ownerRejectedAt: null,
    emailDeliveryStatus: null,
    emailDeliveryError: null,
    emailDeliveryProviderId: null,
    emailLastSentAt: null,
  });

  if (!updatedInvite) {
    throw new Error("Failed to resend invitation.");
  }

  return {
    invitation: toTaggedInvitation(updatedInvite),
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
    inviteStatus: InvitationStatusEnum.enumValues[3],
    inviteTokenHash: null,
    inviteExpiresAt: null,
    inviteRevokedAt: now,
  });

  if (!updatedInvite) {
    throw new Error("Failed to revoke invitation.");
  }

  return toTaggedInvitation(updatedInvite);
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
  if (invite.inviteStatus !== "pending_owner_approval") {
    throw new Error("Invitation is not pending owner approval.");
  }
  if (!invite.userId) {
    throw new Error("Cannot approve without a recipient user.");
  }

  const updated = await invitationRepo.updateInvitation(params.invitationId, {
    inviteStatus: InvitationStatusEnum.enumValues[1],
    inviteAcceptedAt: now,
    inviteTokenHash: null,
    inviteExpiresAt: null,
    ownerApprovedBy: params.ownerId,
    ownerApprovedAt: now,
    ownerRejectedBy: null,
    ownerRejectedAt: null,
  });

  if (!updated) {
    throw new Error("Failed to approve invitation.");
  }

  return toTaggedInvitation(updated);
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
  if (invite.inviteStatus !== "pending_owner_approval") {
    throw new Error("Invitation is not pending owner approval.");
  }

  const updated = await invitationRepo.updateInvitation(params.invitationId, {
    inviteStatus: InvitationStatusEnum.enumValues[3],
    inviteTokenHash: null,
    inviteExpiresAt: null,
    inviteRevokedAt: now,
    ownerRejectedBy: params.ownerId,
    ownerRejectedAt: now,
  });

  if (!updated) {
    throw new Error("Failed to reject invitation.");
  }

  return toTaggedInvitation(updated);
}

export async function listInvitationsForList(
  params: {
    listId: List["id"];
    statuses?: InvitationStatus[];
  },
  repo?: InvitationRepository
): Promise<ListInvitation[]> {
  const invitationRepo = getRepository(repo);
  const statuses = params.statuses ?? InvitationStatusEnum.enumValues;
  const invitations = await invitationRepo.listInvitationsByStatus(
    params.listId,
    statuses
  );
  return invitations.map(toTaggedInvitation);
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
  return invitation ? toTaggedInvitation(invitation) : null;
}

export type ConsumeInvitationResult =
  | { status: "invalid" }
  | { status: "revoked" | "expired" | "accepted" | "pending_owner_approval" }
  | { status: "accepted_now"; invitation: ListInvitation }
  | { status: "pending_owner_approval_now"; invitation: ListInvitation };

export async function consumeInvitationToken(
  params: {
    inviteToken: string;
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

  if (invite.inviteStatus === "revoked") {
    return { status: "revoked" };
  }
  if (invite.inviteStatus === "accepted") {
    return { status: "accepted" };
  }
  if (invite.inviteStatus === "pending_owner_approval") {
    return { status: "pending_owner_approval" };
  }
  if (invite.inviteStatus === "expired") {
    return { status: "expired" };
  }

  if (isInvitationExpired(invite.inviteExpiresAt, now)) {
    await invitationRepo.updateInvitation(invite.id as ListInvitation["id"], {
      inviteStatus: InvitationStatusEnum.enumValues[4],
      inviteTokenHash: null,
      inviteExpiredAt: now,
    });

    return { status: "expired" };
  }

  const inviteEmail = invite.invitedEmailNormalized;
  if (!inviteEmail) {
    return { status: "invalid" };
  }

  const normalizedUserEmail = normalizeEmail(params.userEmail);
  const status =
    normalizedUserEmail === inviteEmail
      ? (InvitationStatusEnum.enumValues[1] as InvitationStatus)
      : (InvitationStatusEnum.enumValues[2] as InvitationStatus);

  const updated = await invitationRepo.updateInvitation(
    invite.id as ListInvitation["id"],
    {
      userId: params.userId,
      inviteStatus: status,
      inviteTokenHash: null,
      inviteExpiresAt: null,
      inviteAcceptedAt: status === "accepted" ? now : null,
      ownerApprovalRequestedAt: status === "pending_owner_approval" ? now : null,
    }
  );

  if (!updated) {
    return { status: "invalid" };
  }

  if (status === "accepted") {
    return {
      status: "accepted_now",
      invitation: toTaggedInvitation(updated),
    };
  }

  return {
    status: "pending_owner_approval_now",
    invitation: toTaggedInvitation(updated),
  };
}

export async function markInvitationEmailDelivery(
  params: {
    invitationId: ListInvitation["id"];
    status: "sent" | "failed";
    providerId: string | null;
    errorMessage: string | null;
  },
  repo?: InvitationRepository
): Promise<ListInvitation> {
  const invitationRepo = getRepository(repo);
  const now = new Date();

  const updated = await invitationRepo.updateInvitation(params.invitationId, {
    emailDeliveryStatus: params.status,
    emailDeliveryProviderId: params.providerId,
    emailDeliveryError: params.errorMessage,
    emailLastSentAt: now,
  });

  if (!updated) {
    throw new Error("Failed to update invitation delivery metadata.");
  }

  return toTaggedInvitation(updated);
}

export async function markInvitationEmailDeliveryByProviderId(
  params: {
    providerId: string;
    status: "sent" | "failed";
    errorMessage: string | null;
  },
  repo?: InvitationRepository
): Promise<ListInvitation | null> {
  const invitationRepo = getRepository(repo);
  const existing = await invitationRepo.findByEmailDeliveryProviderId(
    params.providerId
  );
  if (!existing) {
    return null;
  }

  const updated = await invitationRepo.updateInvitation(
    existing.id as ListInvitation["id"],
    {
      emailDeliveryStatus: params.status,
      emailDeliveryError: params.errorMessage,
      emailLastSentAt: new Date(),
    }
  );

  return updated ? toTaggedInvitation(updated) : null;
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
    inviteStatus: "revoked",
    inviteTokenHash: null,
    inviteExpiresAt: null,
    inviteRevokedAt: now,
  });

  return updated.map(toTaggedInvitation);
}
