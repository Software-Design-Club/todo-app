import { ListUser, User } from "@/lib/types";
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
