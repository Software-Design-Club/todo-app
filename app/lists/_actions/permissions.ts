import { sql } from "@vercel/postgres";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { CollaboratorRoleEnum, ListCollaboratorsTable } from "@/drizzle/schema";
import { InvitationPermissionDeniedError } from "@/lib/invitations/errors";
import { List, ListUser, User } from "@/lib/types";

const ALLOWED_TO_EDIT_COLLABORATORS_ROLES = [
  CollaboratorRoleEnum.enumValues[0],
];
const ALLOWED_TO_EDIT_LIST_ROLES = [...CollaboratorRoleEnum.enumValues];
type CollaboratorRole = (typeof CollaboratorRoleEnum.enumValues)[number];

export function userCanEditList(
  collaborators: ListUser[],
  userId: User["id"] | null
): boolean {
  // A user must be authenticated to edit a list
  if (!userId) {
    return false;
  }

  // An authenticated user must also be a collaborator with an allowed role
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

/**
 * @contract assertCanInviteCollaborators
 *
 * Returns successfully iff actorId is allowed to invite collaborators to listId.
 * Does not mutate invitation or collaborator state.
 *
 * @throws InvitationPermissionDeniedError if not allowed.
 */
export async function assertCanInviteCollaborators(input: {
  listId: List["id"];
  actorId: User["id"];
}): Promise<void> {
  const db = drizzle(sql);
  const [membership] = await db
    .select({
      id: ListCollaboratorsTable.id,
    })
    .from(ListCollaboratorsTable)
    .where(
      and(
        eq(ListCollaboratorsTable.listId, input.listId),
        eq(ListCollaboratorsTable.userId, input.actorId),
        eq(ListCollaboratorsTable.role, "owner"),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new InvitationPermissionDeniedError({
      listId: Number(input.listId),
      actorId: Number(input.actorId),
    });
  }
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
  // Archived lists are only accessible to owners
  if (list.state === "archived") {
    if (!userId) return false;
    return Number(list.creatorId) === Number(userId);
  }

  // Public lists viewable by anyone
  if (list.visibility === "public") {
    return true;
  }

  // Private lists require collaborator access
  if (!userId) return false;
  return collaborators.some((c) => c.User.id === userId);
}
