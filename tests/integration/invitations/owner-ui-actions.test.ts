import { describe, expect, it } from "vitest";
import type { ListInvitation, ListUser } from "@/lib/types";
import {
  createTaggedListId,
  createTaggedListInvitationId,
  createTaggedUserId,
  createTaggedUser,
} from "@/lib/types";
import { INVITATION_STATUS } from "@/lib/invitations/constants";
import { isAuthorizedToEditCollaborators } from "@/app/lists/_actions/permissions";
import { groupInvitationsForOwnerUi } from "@/lib/invitations/ui";

function buildListUser(params: {
  id: number;
  role: "owner" | "collaborator";
}): ListUser {
  return {
    User: createTaggedUser({
      id: params.id,
      email: `user${params.id}@example.com`,
      name: `User ${params.id}`,
    }),
    listId: createTaggedListId(1),
    Role: params.role,
  };
}

function buildInvitation(
  id: number,
  inviteStatus: ListInvitation["inviteStatus"]
): ListInvitation {
  return {
    id: createTaggedListInvitationId(id),
    listId: createTaggedListId(1),
    userId: null,
    inviteStatus,
    invitedEmailNormalized: `invite-${id}@example.com` as ListInvitation["invitedEmailNormalized"],
    inviteTokenHash: null,
    inviteExpiresAt: null,
    inviterId: createTaggedUserId(1),
    inviteSentAt: null,
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
      isAuthorizedToEditCollaborators(collaborators, createTaggedUserId(1))
    ).toBe(true);
    expect(
      isAuthorizedToEditCollaborators(collaborators, createTaggedUserId(2))
    ).toBe(false);
  });

  it("groups pending and approval invitations for rendering", () => {
    const grouped = groupInvitationsForOwnerUi([
      buildInvitation(1, INVITATION_STATUS.SENT as ListInvitation["inviteStatus"]),
      buildInvitation(
        2,
        INVITATION_STATUS.PENDING_APPROVAL as ListInvitation["inviteStatus"]
      ),
      buildInvitation(3, INVITATION_STATUS.ACCEPTED as ListInvitation["inviteStatus"]),
    ]);

    expect(grouped.pending).toHaveLength(1);
    expect(grouped.pendingApproval).toHaveLength(1);
    expect(grouped.terminal).toHaveLength(1);
  });
});
