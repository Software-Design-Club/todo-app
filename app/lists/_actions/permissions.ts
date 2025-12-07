import { List, ListUser, User } from "@/lib/types";
import { CollaboratorRoleEnum } from "@/drizzle/schema";

const ALLOWED_TO_EDIT_COLLABORATORS_ROLES = [
  CollaboratorRoleEnum.enumValues[0],
];
const ALLOWED_TO_EDIT_LIST_ROLES = [...CollaboratorRoleEnum.enumValues];
type CollaboratorRole = (typeof CollaboratorRoleEnum.enumValues)[number];

export function isAuthorizedToEditList(
  collaborators: ListUser[],
  userId: User["id"]
) {
  return collaborators.some(
    (collaborator) =>
      collaborator.User.id === userId &&
      ALLOWED_TO_EDIT_LIST_ROLES.includes(collaborator.Role as CollaboratorRole)
  );
}

export function isAuthorizedToEditCollaborators(
  collaborators: ListUser[],
  userId: User["id"]
) {
  return collaborators.some(
    (collaborator) =>
      collaborator.User.id === userId &&
      ALLOWED_TO_EDIT_COLLABORATORS_ROLES.includes(
        collaborator.Role as (typeof CollaboratorRoleEnum.enumValues)[0]
      )
  );
}

export function canBeRemovedAsCollaborator(collaborator: ListUser) {
  const isOwner = collaborator.Role === "owner";

  return !isOwner;
}

export function isAuthorizedToChangeVisibility(
  collaborators: ListUser[],
  userId: User["id"]
): boolean {
  return collaborators.some(
    (collaborator) =>
      collaborator.User.id === userId && collaborator.Role === "owner"
  );
}

export function canViewList(
  list: List,
  collaborators: ListUser[],
  userId: User["id"] | null
): boolean {
  // Public lists viewable by anyone
  if (list.visibility === "public") {
    return true;
  }

  // Private lists require collaborator access
  if (!userId) return false;
  return collaborators.some((c) => c.User.id === userId);
}

export function canEditList(
  collaborators: ListUser[],
  userId: User["id"] | null
): boolean {
  // Must be authenticated
  if (!userId) return false;

  // Must be a collaborator (regardless of visibility)
  return isAuthorizedToEditList(collaborators, userId);
}
