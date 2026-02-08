import type { ListCollaboratorsTable } from "@/drizzle/schema";
import type { InvitationStatus, List, ListInvitation } from "@/lib/types";
import type { InvitationRepository } from "@/lib/invitations/service";

type InvitationRow = typeof ListCollaboratorsTable.$inferSelect;

export class InMemoryInvitationRepository implements InvitationRepository {
  private rows: InvitationRow[] = [];
  private nextId = 1;

  async findOpenByEmail(
    listId: List["id"],
    invitedEmailNormalized: string
  ): Promise<InvitationRow | null> {
    const row = this.rows.find(
      (candidate) =>
        candidate.listId === listId &&
        candidate.invitedEmailNormalized === invitedEmailNormalized &&
        (candidate.inviteStatus === "sent" ||
          candidate.inviteStatus === "pending_owner_approval")
    );
    return row ? { ...row } : null;
  }

  async findById(
    invitationId: ListInvitation["id"],
    listId: List["id"]
  ): Promise<InvitationRow | null> {
    const row = this.rows.find(
      (candidate) => candidate.id === invitationId && candidate.listId === listId
    );
    return row ? { ...row } : null;
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationRow | null> {
    const row = this.rows.find((candidate) => candidate.inviteTokenHash === tokenHash);
    return row ? { ...row } : null;
  }

  async createInvitation(
    values: Omit<typeof ListCollaboratorsTable.$inferInsert, "id" | "createdAt" | "updatedAt">
  ): Promise<InvitationRow> {
    const now = new Date();
    const row: InvitationRow = {
      id: this.nextId++,
      listId: values.listId as number,
      userId: (values.userId ?? null) as number | null,
      role: values.role ?? "collaborator",
      inviteStatus: (values.inviteStatus ?? "accepted") as InvitationStatus,
      invitedEmailNormalized: values.invitedEmailNormalized ?? null,
      inviteTokenHash: values.inviteTokenHash ?? null,
      inviteExpiresAt: values.inviteExpiresAt ?? null,
      inviterId: (values.inviterId ?? null) as number | null,
      inviteSentAt: values.inviteSentAt ?? null,
      inviteAcceptedAt: values.inviteAcceptedAt ?? null,
      inviteRevokedAt: values.inviteRevokedAt ?? null,
      inviteExpiredAt: values.inviteExpiredAt ?? null,
      ownerApprovalRequestedAt: values.ownerApprovalRequestedAt ?? null,
      ownerApprovedBy: (values.ownerApprovedBy ?? null) as number | null,
      ownerApprovedAt: values.ownerApprovedAt ?? null,
      ownerRejectedBy: (values.ownerRejectedBy ?? null) as number | null,
      ownerRejectedAt: values.ownerRejectedAt ?? null,
      emailDeliveryStatus: values.emailDeliveryStatus ?? null,
      emailDeliveryError: values.emailDeliveryError ?? null,
      emailDeliveryProviderId: values.emailDeliveryProviderId ?? null,
      emailLastSentAt: values.emailLastSentAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(row);
    return { ...row };
  }

  async updateInvitation(
    invitationId: ListInvitation["id"],
    values: Partial<Omit<typeof ListCollaboratorsTable.$inferInsert, "listId">>
  ): Promise<InvitationRow | null> {
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
    return { ...updated };
  }

  async listInvitationsByStatus(
    listId: List["id"],
    statuses: InvitationStatus[]
  ): Promise<InvitationRow[]> {
    return this.rows
      .filter(
        (candidate) =>
          candidate.listId === listId && statuses.includes(candidate.inviteStatus)
      )
      .map((row) => ({ ...row }));
  }
}
