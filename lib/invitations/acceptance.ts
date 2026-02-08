import type { ConsumeInvitationResult } from "./service";

export interface InvitationAcceptanceUiState {
  title: string;
  description: string;
  listId: number | null;
}

export function getInvitationAcceptanceUiState(
  result: ConsumeInvitationResult
): InvitationAcceptanceUiState {
  if (result.status === "accepted_now") {
    return {
      title: "Invitation accepted",
      description:
        "You now have collaborator access to this list. You can open it right away.",
      listId: result.invitation.listId,
    };
  }

  if (result.status === "pending_owner_approval_now") {
    return {
      title: "Awaiting owner approval",
      description:
        "This invitation email does not match your signed-in account. The list owner must approve access.",
      listId: null,
    };
  }

  if (result.status === "accepted") {
    return {
      title: "Invitation already accepted",
      description:
        "This invitation was already used. If you still need access, ask the owner to resend.",
      listId: null,
    };
  }

  if (result.status === "pending_owner_approval") {
    return {
      title: "Owner approval pending",
      description:
        "This invitation is waiting for owner review before access can be granted.",
      listId: null,
    };
  }

  if (result.status === "revoked") {
    return {
      title: "Invitation revoked",
      description: "This invitation link is no longer valid.",
      listId: null,
    };
  }

  if (result.status === "expired") {
    return {
      title: "Invitation expired",
      description: "This invitation expired. Ask the owner to send a new one.",
      listId: null,
    };
  }

  return {
    title: "Invalid invitation",
    description:
      "This invitation link is invalid or has already been consumed.",
    listId: null,
  };
}
