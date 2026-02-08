import type { ListInvitation } from "@/lib/types";

export interface InvitationUiGroups {
  pending: ListInvitation[];
  pendingOwnerApproval: ListInvitation[];
  terminal: ListInvitation[];
}

export function groupInvitationsForOwnerUi(
  invitations: ListInvitation[]
): InvitationUiGroups {
  const pending = invitations.filter((invitation) => invitation.inviteStatus === "sent");
  const pendingOwnerApproval = invitations.filter(
    (invitation) => invitation.inviteStatus === "pending_owner_approval"
  );
  const terminal = invitations.filter(
    (invitation) =>
      invitation.inviteStatus === "revoked" ||
      invitation.inviteStatus === "expired" ||
      invitation.inviteStatus === "accepted"
  );

  return {
    pending,
    pendingOwnerApproval,
    terminal,
  };
}
