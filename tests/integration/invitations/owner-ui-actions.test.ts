import { describe, expect, it } from "vitest";
import type { ListInvitation, ListUser, User } from "@/lib/types";
import { isAuthorizedToEditCollaborators } from "@/app/lists/_actions/permissions";
import { groupInvitationsForOwnerUi } from "@/lib/invitations/ui";

function buildListUser(params: {
  id: number;
  role: "owner" | "collaborator";
}): ListUser {
  return {
    User: {
      id: params.id as User["id"],
      email: `user${params.id}@example.com` as User["email"],
      name: `User ${params.id}` as User["name"],
    },
    listId: 1 as ListUser["listId"],
    Role: params.role,
  };
}

function buildInvitation(
  id: number,
  inviteStatus: ListInvitation["inviteStatus"]
): ListInvitation {
  return {
    id: id as ListInvitation["id"],
    listId: 1 as ListInvitation["listId"],
    userId: null,
    inviteStatus,
    invitedEmailNormalized: `invite-${id}@example.com` as ListInvitation["invitedEmailNormalized"],
    inviteTokenHash: null,
    inviteExpiresAt: null,
    inviterId: 1 as User["id"],
    inviteSentAt: null,
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
    role: "collaborator",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("owner invitation UI actions", () => {
  it("enforces owner-only invitation management", () => {
    const collaborators = [
      buildListUser({ id: 1, role: "owner" }),
      buildListUser({ id: 2, role: "collaborator" }),
    ];

    expect(
      isAuthorizedToEditCollaborators(collaborators, 1 as User["id"])
    ).toBe(true);
    expect(
      isAuthorizedToEditCollaborators(collaborators, 2 as User["id"])
    ).toBe(false);
  });

  it("groups pending and owner-approval invitations for rendering", () => {
    const grouped = groupInvitationsForOwnerUi([
      buildInvitation(1, "sent" as ListInvitation["inviteStatus"]),
      buildInvitation(
        2,
        "pending_owner_approval" as ListInvitation["inviteStatus"]
      ),
      buildInvitation(3, "accepted" as ListInvitation["inviteStatus"]),
    ]);

    expect(grouped.pending).toHaveLength(1);
    expect(grouped.pendingOwnerApproval).toHaveLength(1);
    expect(grouped.terminal).toHaveLength(1);
  });
});
