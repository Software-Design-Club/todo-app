import { describe, expect, it } from "vitest";
import type { ListCollaboratorsTable } from "@/drizzle/schema";
import type { InvitationStatus, List, ListInvitation, User } from "@/lib/types";
import {
  approvePendingOwnerInvitation,
  consumeInvitationToken,
  createOrRotateInvitation,
  rejectPendingOwnerInvitation,
  revokeInvitation,
  type InvitationRepository,
} from "@/lib/invitations/service";

type InvitationRow = typeof ListCollaboratorsTable.$inferSelect;

class InMemoryInvitationRepository implements InvitationRepository {
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

describe("invitation service integration", () => {
  it("reuses open rows and rotates tokens for duplicate open invite attempts", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = 11 as List["id"];
    const inviterId = 7 as User["id"];

    const firstInvite = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "friend@example.com" },
      repo
    );
    const secondInvite = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "friend@example.com" },
      repo
    );

    expect(secondInvite.reusedExistingRow).toBe(true);
    expect(secondInvite.invitation.id).toBe(firstInvite.invitation.id);
    expect(secondInvite.inviteToken).not.toBe(firstInvite.inviteToken);
  });

  it("enforces revoke transition against non-open states", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = 22 as List["id"];
    const inviterId = 8 as User["id"];

    const created = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "member@example.com" },
      repo
    );

    const revoked = await revokeInvitation(
      { invitationId: created.invitation.id, listId },
      repo
    );
    expect(revoked.inviteStatus).toBe("revoked");

    await expect(
      revokeInvitation({ invitationId: created.invitation.id, listId }, repo)
    ).rejects.toThrow("Only open invitations can be revoked.");
  });

  it("supports pending-owner-approval approve/reject transitions", async () => {
    const repo = new InMemoryInvitationRepository();
    const listId = 33 as List["id"];
    const inviterId = 9 as User["id"];
    const ownerId = 10 as User["id"];

    const created = await createOrRotateInvitation(
      { listId, inviterId, invitedEmail: "expected@example.com" },
      repo
    );

    const consumed = await consumeInvitationToken(
      {
        inviteToken: created.inviteToken,
        userId: 99 as User["id"],
        userEmail: "different@example.com",
      },
      repo
    );
    expect(consumed.status).toBe("pending_owner_approval_now");

    const approved = await approvePendingOwnerInvitation(
      {
        invitationId: created.invitation.id,
        listId,
        ownerId,
      },
      repo
    );
    expect(approved.inviteStatus).toBe("accepted");

    await expect(
      rejectPendingOwnerInvitation(
        {
          invitationId: created.invitation.id,
          listId,
          ownerId,
        },
        repo
      )
    ).rejects.toThrow("Invitation is not pending owner approval.");
  });
});
