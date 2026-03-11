export class ListNotFoundError extends Error {
  constructor(listId: number) {
    super(`List not found: ${listId}`);
    this.name = "ListNotFoundError";
  }
}

export class UserNotFoundError extends Error {
  constructor(userId: number) {
    super(`User not found: ${userId}`);
    this.name = "UserNotFoundError";
  }
}
