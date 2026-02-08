import { expect, test } from "@playwright/test";
import type { ListInvitation, User } from "../../../lib/types";
import { groupInvitationsForOwnerUi } from "../../../lib/invitations/ui";

test("owner management grouping includes pending invitation workflows", async () => {
  const invitation: ListInvitation = {
    id: 1 as ListInvitation["id"],
    listId: 1 as ListInvitation["listId"],
    userId: null,
    inviteStatus: "sent" as ListInvitation["inviteStatus"],
    invitedEmailNormalized:
      "pending@example.com" as ListInvitation["invitedEmailNormalized"],
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

  const grouped = groupInvitationsForOwnerUi([
    invitation,
  ]);

  expect(grouped.pending.length).toBe(1);
});
