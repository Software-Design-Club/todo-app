import type { ListCollaboratorsTable } from "@/drizzle/schema";
import { INVITATION_STATUS } from "@/lib/invitations/constants";
import type { InvitationStatus, List, ListInvitation } from "@/lib/types";
import { createTaggedListInvitation } from "@/lib/types";
import type { InvitationRepository } from "@/lib/invitations/service";

type InvitationRow = typeof ListCollaboratorsTable.$inferSelect;
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

const OPEN_INVITATION_STATUSES: InvitationStatus[] = [
  INVITATION_STATUS.SENT,
  INVITATION_STATUS.PENDING_APPROVAL,
];

function buildRow(id: number, values: InvitationInsert, now: Date): InvitationRow {
  return {
    id,
    listId: values.listId as number,
    userId: (values.userId ?? null) as number | null,
    role: values.role ?? "collaborator",
    inviteStatus: (values.inviteStatus ?? INVITATION_STATUS.ACCEPTED) as InvitationStatus,
    invitedEmailNormalized: values.invitedEmailNormalized ?? null,
    inviteTokenHash: values.inviteTokenHash ?? null,
    inviteExpiresAt: values.inviteExpiresAt ?? null,
    inviterId: (values.inviterId ?? null) as number | null,
    inviteSentAt: values.inviteSentAt ?? null,
    inviteAcceptedAt: values.inviteAcceptedAt ?? null,
    inviteRevokedAt: values.inviteRevokedAt ?? null,
    inviteExpiredAt: values.inviteExpiredAt ?? null,
    invitationApprovalRequestedAt: values.invitationApprovalRequestedAt ?? null,
    invitationApprovedBy: (values.invitationApprovedBy ?? null) as number | null,
    invitationApprovedAt: values.invitationApprovedAt ?? null,
    invitationRejectedBy: (values.invitationRejectedBy ?? null) as number | null,
    invitationRejectedAt: values.invitationRejectedAt ?? null,
    emailDeliveryStatus: values.emailDeliveryStatus ?? null,
    emailDeliveryError: values.emailDeliveryError ?? null,
    emailDeliveryProviderId: values.emailDeliveryProviderId ?? null,
    emailLastSentAt: values.emailLastSentAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export class InMemoryInvitationRepository implements InvitationRepository {
  private rows: InvitationRow[] = [];
  private nextId = 1;

  async findOpenByEmail(
    listId: List["id"],
    invitedEmailNormalized: InvitationEmail
  ): Promise<ListInvitation | null> {
    const row = this.rows.find(
      (candidate) =>
        candidate.listId === listId &&
        candidate.invitedEmailNormalized === invitedEmailNormalized &&
        OPEN_INVITATION_STATUSES.includes(candidate.inviteStatus)
    );
    return row ? createTaggedListInvitation(row) : null;
  }

  async findAcceptedByEmail(
    listId: List["id"],
    invitedEmailNormalized: InvitationEmail
  ): Promise<ListInvitation | null> {
    const row = this.rows.find(
      (candidate) =>
        candidate.listId === listId &&
        candidate.invitedEmailNormalized === invitedEmailNormalized &&
        candidate.inviteStatus === INVITATION_STATUS.ACCEPTED
    );
    return row ? createTaggedListInvitation(row) : null;
  }

  async findById(
    invitationId: ListInvitation["id"],
    listId: List["id"]
  ): Promise<ListInvitation | null> {
    const row = this.rows.find(
      (candidate) => candidate.id === invitationId && candidate.listId === listId
    );
    return row ? createTaggedListInvitation(row) : null;
  }

  async findByTokenHash(tokenHash: InvitationTokenHash): Promise<ListInvitation | null> {
    const row = this.rows.find((candidate) => candidate.inviteTokenHash === tokenHash);
    return row ? createTaggedListInvitation(row) : null;
  }

  async findByEmailDeliveryProviderId(
    providerId: InvitationEmailDeliveryProviderId
  ): Promise<ListInvitation | null> {
    const row = this.rows.find(
      (candidate) => candidate.emailDeliveryProviderId === providerId
    );
    return row ? createTaggedListInvitation(row) : null;
  }

  async createInvitation(values: InvitationInsert): Promise<ListInvitation> {
    const row = buildRow(this.nextId++, values, new Date());
    this.rows.push(row);
    return createTaggedListInvitation(row);
  }

  async upsertOpenInvitation(
    values: InvitationInsert,
    updateValues: InvitationUpdate
  ): Promise<{ invitation: ListInvitation; reusedExistingRow: boolean }> {
    const invitedEmailNormalized = values.invitedEmailNormalized;
    if (!invitedEmailNormalized) {
      throw new Error("Cannot upsert invitation without an invited email.");
    }

    const rowIndex = this.rows.findIndex(
      (candidate) =>
        candidate.listId === values.listId &&
        candidate.invitedEmailNormalized === invitedEmailNormalized &&
        OPEN_INVITATION_STATUSES.includes(candidate.inviteStatus)
    );

    if (rowIndex === -1) {
      const created = buildRow(this.nextId++, values, new Date());
      this.rows.push(created);
      return { invitation: createTaggedListInvitation(created), reusedExistingRow: false };
    }

    const updated: InvitationRow = {
      ...this.rows[rowIndex],
      ...updateValues,
      updatedAt: new Date(),
    };
    this.rows[rowIndex] = updated;
    return { invitation: createTaggedListInvitation(updated), reusedExistingRow: true };
  }

  async updateInvitation(
    invitationId: ListInvitation["id"],
    values: InvitationUpdate
  ): Promise<ListInvitation | null> {
    const rowIndex = this.rows.findIndex((candidate) => candidate.id === invitationId);
    if (rowIndex === -1) {
      return null;
    }

    const current = this.rows[rowIndex];
    const updated: InvitationRow = {
      ...current,
      ...values,
      updatedAt: new Date(),
    };
    this.rows[rowIndex] = updated;
    return createTaggedListInvitation(updated);
  }

  async updateInvitationOptimistic(
    invitationId: ListInvitation["id"],
    values: InvitationUpdate,
    conditions: {
      tokenHash: InvitationTokenHash;
      status: InvitationStatus;
    }
  ): Promise<ListInvitation | null> {
    const rowIndex = this.rows.findIndex(
      (candidate) =>
        candidate.id === invitationId &&
        candidate.inviteTokenHash === conditions.tokenHash &&
        candidate.inviteStatus === conditions.status
    );
    if (rowIndex === -1) {
      return null;
    }

    const current = this.rows[rowIndex];
    const updated: InvitationRow = {
      ...current,
      ...values,
      updatedAt: new Date(),
    };
    this.rows[rowIndex] = updated;
    return createTaggedListInvitation(updated);
  }

  async updateOpenInvitations(
    listId: List["id"],
    values: InvitationUpdate
  ): Promise<ListInvitation[]> {
    const updatedRows: InvitationRow[] = [];

    this.rows = this.rows.map((candidate) => {
      if (
        candidate.listId !== listId ||
        !OPEN_INVITATION_STATUSES.includes(candidate.inviteStatus)
      ) {
        return candidate;
      }

      const updated: InvitationRow = {
        ...candidate,
        ...values,
        updatedAt: new Date(),
      };
      updatedRows.push(updated);
      return updated;
    });

    return updatedRows.map(createTaggedListInvitation);
  }

  async listInvitationsByStatus(
    listId: List["id"],
    statuses: InvitationStatus[]
  ): Promise<ListInvitation[]> {
    return this.rows
      .filter(
        (candidate) =>
          candidate.listId === listId && statuses.includes(candidate.inviteStatus)
      )
      .map(createTaggedListInvitation);
  }

  async listInvitationsByListIds(
    listIds: List["id"][],
    statuses: InvitationStatus[]
  ): Promise<ListInvitation[]> {
    return this.rows
      .filter(
        (candidate) =>
          listIds.includes(candidate.listId as List["id"]) &&
          statuses.includes(candidate.inviteStatus)
      )
      .map(createTaggedListInvitation);
  }
}
