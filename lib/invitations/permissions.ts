import type { ListUser, User } from "@/lib/types";

export function canManageInvitations(
  collaborators: ListUser[],
  userId: User["id"]
): boolean {
  return collaborators.some(
    (collaborator) =>
      collaborator.User.id === userId && collaborator.Role === "owner"
  );
}
