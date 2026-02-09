import {
  InvitationStatusEnum,
  ListCollaboratorsTable,
  ListsTable,
  UsersTable,
  CollaboratorRoleEnum,
  ListVisibilityEnum,
  ListStateEnum,
} from "@/drizzle/schema";
import { Tagged } from "type-fest";

export type ListVisibility = (typeof ListVisibilityEnum.enumValues)[number];
export type ListState = (typeof ListStateEnum.enumValues)[number];

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
  userRole: (typeof CollaboratorRoleEnum.enumValues)[number];
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
  Role: (typeof CollaboratorRoleEnum.enumValues)[number];
};

export type InvitationStatus = (typeof InvitationStatusEnum.enumValues)[number];

export type InviteToken = Tagged<string, "InviteToken">;
export type InviteTokenHash = Tagged<string, "InviteTokenHash">;
export type InvitedEmailNormalized = Tagged<string, "InvitedEmailNormalized">;
export type EmailDeliveryStatus = Tagged<string, "EmailDeliveryStatus">;
export type EmailDeliveryProviderId = Tagged<string, "EmailDeliveryProviderId">;

export type ListInvitation = {
  id: Tagged<
    (typeof ListCollaboratorsTable.$inferSelect)["id"],
    "ListInvitationId"
  >;
  listId: List["id"];
  userId: User["id"] | null;
  inviteStatus: Tagged<InvitationStatus, "InvitationStatus">;
  invitedEmailNormalized: InvitedEmailNormalized | null;
  inviteTokenHash: InviteTokenHash | null;
  inviteExpiresAt: Date | null;
  inviterId: User["id"] | null;
  inviteSentAt: Date | null;
  inviteAcceptedAt: Date | null;
  inviteRevokedAt: Date | null;
  inviteExpiredAt: Date | null;
  invitationApprovalRequestedAt: Date | null;
  invitationApprovedBy: User["id"] | null;
  invitationApprovedAt: Date | null;
  invitationRejectedBy: User["id"] | null;
  invitationRejectedAt: Date | null;
  emailDeliveryStatus: EmailDeliveryStatus | null;
  emailDeliveryError: string | null;
  emailDeliveryProviderId: EmailDeliveryProviderId | null;
  emailLastSentAt: Date | null;
  role: (typeof CollaboratorRoleEnum.enumValues)[number];
  createdAt: Date;
  updatedAt: Date;
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
    Role: listUser.role,
  };
};

export const createTaggedListId = (id: number): List["id"] =>
  id as List["id"];

export const createTaggedUserId = (id: number): User["id"] =>
  id as User["id"];

export const createTaggedListInvitationId = (id: number): ListInvitation["id"] =>
  id as ListInvitation["id"];

export const createTaggedInviteToken = (token: string): InviteToken =>
  token as InviteToken;

export const createTaggedInviteTokenHash = (hash: string): InviteTokenHash =>
  hash as InviteTokenHash;

export const createTaggedInvitedEmailNormalized = (
  email: string
): InvitedEmailNormalized => email as InvitedEmailNormalized;

export const createTaggedEmailDeliveryProviderId = (
  providerId: string
): EmailDeliveryProviderId => providerId as EmailDeliveryProviderId;

export const createTaggedListInvitation = (
  invitation: typeof ListCollaboratorsTable.$inferSelect
): ListInvitation => {
  return {
    id: invitation.id as ListInvitation["id"],
    listId: invitation.listId as List["id"],
    userId: invitation.userId as User["id"] | null,
    inviteStatus: invitation.inviteStatus as ListInvitation["inviteStatus"],
    invitedEmailNormalized: invitation.invitedEmailNormalized as
      | ListInvitation["invitedEmailNormalized"]
      | null,
    inviteTokenHash: invitation.inviteTokenHash as
      | ListInvitation["inviteTokenHash"]
      | null,
    inviteExpiresAt: invitation.inviteExpiresAt,
    inviterId: invitation.inviterId as User["id"] | null,
    inviteSentAt: invitation.inviteSentAt,
    inviteAcceptedAt: invitation.inviteAcceptedAt,
    inviteRevokedAt: invitation.inviteRevokedAt,
    inviteExpiredAt: invitation.inviteExpiredAt,
    invitationApprovalRequestedAt: invitation.invitationApprovalRequestedAt,
    invitationApprovedBy: invitation.invitationApprovedBy as User["id"] | null,
    invitationApprovedAt: invitation.invitationApprovedAt,
    invitationRejectedBy: invitation.invitationRejectedBy as User["id"] | null,
    invitationRejectedAt: invitation.invitationRejectedAt,
    emailDeliveryStatus: invitation.emailDeliveryStatus as
      | ListInvitation["emailDeliveryStatus"]
      | null,
    emailDeliveryError: invitation.emailDeliveryError,
    emailDeliveryProviderId: invitation.emailDeliveryProviderId as
      | ListInvitation["emailDeliveryProviderId"]
      | null,
    emailLastSentAt: invitation.emailLastSentAt,
    role: invitation.role,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
};
