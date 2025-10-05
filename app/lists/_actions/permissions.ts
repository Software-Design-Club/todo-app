import { ListUser, User } from "@/lib/types";

const ALLOWED_TO_EDIT_COLLABORATORS_ROLES = ["owner"];
const ALLOWED_TO_EDIT_LIST_ROLES = ["owner", "collaborator"];

export function isAuthorizedToEditList(
  collaborators: ListUser[],
  userId: User["id"]
) {
  return collaborators.some(
    (collaborator) =>
      collaborator.User.id === userId &&
      ALLOWED_TO_EDIT_LIST_ROLES.includes(collaborator.Role)
  );
}

export function isAuthorizedToEditCollaborators(
  collaborators: ListUser[],
  userId: User["id"]
) {
  return collaborators.some(
    (collaborator) =>
      collaborator.User.id === userId &&
      ALLOWED_TO_EDIT_COLLABORATORS_ROLES.includes(collaborator.Role)
  );
}
