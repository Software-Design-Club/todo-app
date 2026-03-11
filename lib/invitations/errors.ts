export class InvitationPermissionDeniedError extends Error {
  constructor(input: { listId: number; actorId: number }) {
    super(
      `User ${input.actorId} is not allowed to invite collaborators to list ${input.listId}`,
    );
    this.name = "InvitationPermissionDeniedError";
  }
}
