import {
  ListsTable,
  UsersTable,
  CollaboratorRoleEnum,
  ListVisibilityEnum,
  ListStateEnum,
  InvitationStatusEnum,
  InvitationDeliveryEventTypeEnum,
  InvitationsTable,
} from "@/drizzle/schema";
import { Tagged, UnwrapTagged } from "type-fest";

export type ListVisibility = (typeof ListVisibilityEnum.enumValues)[number];
export type ListState = (typeof ListStateEnum.enumValues)[number];
export type UserRole = Tagged<(typeof CollaboratorRoleEnum.enumValues)[number], "UserRole">;
export type DisplayUserRole = Tagged<UnwrapTagged<UserRole> | "viewer", "UserRole">;
export const VIEWER_ROLE: DisplayUserRole = "viewer" as DisplayUserRole;
export const toDisplayUserRole = (role: UserRole): DisplayUserRole => role;
export type InvitationStatus =
  (typeof InvitationStatusEnum.enumValues)[number];
export type InvitationDeliveryEventType =
  (typeof InvitationDeliveryEventTypeEnum.enumValues)[number];

export type List = {
  id: Tagged<(typeof ListsTable.$inferSelect)["id"], "ListId">;
  title: Tagged<(typeof ListsTable.$inferSelect)["title"], "ListTitle">;
  creatorId: Tagged<(typeof ListsTable.$inferSelect)["creatorId"], "CreatorId">;
  visibility: Tagged<ListVisibility, "ListVisibility">;
  state: Tagged<ListState, "ListState">;
  createdAt: Tagged<(typeof ListsTable.$inferSelect)["createdAt"], "CreatedAt">;
  updatedAt: Tagged<(typeof ListsTable.$inferSelect)["updatedAt"], "UpdatedAt">;
};

export type ListWithRole = List & {
  userRole: UserRole;
};

export type User = {
  email: Tagged<(typeof UsersTable.$inferSelect)["email"], "UserEmail">;
  name: Tagged<(typeof UsersTable.$inferSelect)["name"], "UserName">;
  id: Tagged<(typeof UsersTable.$inferSelect)["id"], "UserId">;
  image?: Tagged<string, "UserImage">;
};

export type ListUser = {
  User: User;
  listId: List["id"];
  Role: UserRole;
};

export type Invitation = {
  id: Tagged<(typeof InvitationsTable.$inferSelect)["id"], "InvitationId">;
  listId: List["id"];
  inviterId: User["id"] | null;
  invitedEmailNormalized: Tagged<string, "NormalizedEmailAddress"> | null;
  role: UserRole;
  status: Tagged<InvitationStatus, "InvitationStatus">;
  secretHash: Tagged<string, "InvitationSecretHash"> | null;
  expiresAt: Tagged<Date, "InvitationExpiry"> | null;
  acceptedByUserId: User["id"] | null;
  acceptedByEmail: Tagged<string, "NormalizedEmailAddress"> | null;
  resolvedAt: Tagged<Date, "InvitationResolvedAt"> | null;
  providerMessageId: Tagged<string, "ProviderMessageId"> | null;
  lastDeliveryError: Tagged<string, "DeliveryError"> | null;
  lastDeliveryAttemptAt: Tagged<Date, "DeliveryAttemptedAt"> | null;
  deliveryEventType:
    | Tagged<InvitationDeliveryEventType, "DeliveryEventType">
    | null;
  providerRawEventType: Tagged<string, "ProviderRawEventType"> | null;
  providerEventReceivedAt: Tagged<Date, "ProviderEventReceivedAt"> | null;
  createdAt: Tagged<Date, "CreatedAt">;
  updatedAt: Tagged<Date, "UpdatedAt">;
};

export const createTaggedList = (
  list: typeof ListsTable.$inferSelect
): List => {
  return {
    id: list.id as Tagged<(typeof ListsTable.$inferSelect)["id"], "ListId">,
    title: list.title as Tagged<
      (typeof ListsTable.$inferSelect)["title"],
      "ListTitle"
    >,
    creatorId: list.creatorId as Tagged<
      (typeof ListsTable.$inferSelect)["creatorId"],
      "CreatorId"
    >,
    visibility: list.visibility as Tagged<ListVisibility, "ListVisibility">,
    state: list.state as Tagged<ListState, "ListState">,
    createdAt: list.createdAt as Tagged<
      (typeof ListsTable.$inferSelect)["createdAt"],
      "CreatedAt"
    >,
    updatedAt: list.updatedAt as Tagged<
      (typeof ListsTable.$inferSelect)["updatedAt"],
      "UpdatedAt"
    >,
  };
};

export const createTaggedUser = (
  user: Pick<typeof UsersTable.$inferSelect, "email" | "name" | "id">
): User => {
  return {
    email: user.email as User["email"],
    name: user.name as User["name"],
    id: user.id as User["id"],
  };
};

export const createTaggedListUser = (listUser: {
  id: number;
  name: string;
  email: string;
  role: (typeof CollaboratorRoleEnum.enumValues)[number];
  listId: number;
}): ListUser => {
  return {
    User: createTaggedUser({
      id: listUser.id,
      name: listUser.name,
      email: listUser.email,
    }),
    listId: listUser.listId as List["id"],
    Role: listUser.role as UserRole,
  };
};
