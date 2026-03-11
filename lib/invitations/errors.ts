export class InvitationPermissionDeniedError extends Error {
  constructor(input: { listId: number; actorId: number }) {
    super(
      `User ${input.actorId} is not allowed to invite collaborators to list ${input.listId}`,
    );
    this.name = "InvitationPermissionDeniedError";
  }
}

export class InvalidWebhookSignatureError extends Error {
  constructor(message?: string) {
    super(message ?? "Invalid webhook signature");
    this.name = "InvalidWebhookSignatureError";
  }
}

export class CollaboratorManagementPermissionDeniedError extends Error {
  constructor(input: { listId: number; actorId: number }) {
    super(
      `User ${input.actorId} is not allowed to manage collaborators for list ${input.listId}`,
    );
    this.name = "CollaboratorManagementPermissionDeniedError";
  }
}
