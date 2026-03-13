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
export type EmailAddress = Tagged<string, "EmailAddress">;
export type NormalizedEmailAddress = Tagged<string, "NormalizedEmailAddress">;
export type SafeAppPath = Tagged<`/${string}`, "SafeAppPath">;
export type AppBaseUrl =
  | Tagged<`http://${string}`, "AppBaseUrl">
  | Tagged<`https://${string}`, "AppBaseUrl">;
export type AbsoluteInvitationUrl =
  | Tagged<`http://${string}`, "AbsoluteInvitationUrl">
  | Tagged<`https://${string}`, "AbsoluteInvitationUrl">;
export type ResendApiKey = Tagged<string, "ResendApiKey">;
export type ResendWebhookSecret = Tagged<string, "ResendWebhookSecret">;
export type EmailFromAddress = Tagged<string, "EmailFromAddress">;
export type InvitationSecret = Tagged<string, "InvitationSecret">;
export type InvitationSecretHash = Tagged<string, "InvitationSecretHash">;
export type InvitationExpiry = Tagged<Date, "InvitationExpiry">;
export type InvitationResolvedAt = Tagged<Date, "InvitationResolvedAt">;
export type ProviderMessageId = Tagged<string, "ProviderMessageId">;
export type DeliveryError = Tagged<string, "DeliveryError">;
export type DeliveryAttemptedAt = Tagged<Date, "DeliveryAttemptedAt">;
export type DeliveryEventType = Tagged<
  InvitationDeliveryEventType,
  "DeliveryEventType"
>;
export type ProviderRawEventType = Tagged<string, "ProviderRawEventType">;
export type ProviderEventReceivedAt = Tagged<Date, "ProviderEventReceivedAt">;
export type EmailServiceErrorMessage = Tagged<
  string,
  "EmailServiceErrorMessage"
>;
export type EmailServiceErrorName = Tagged<string, "EmailServiceErrorName">;

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
  invitedEmailNormalized: NormalizedEmailAddress | null;
  role: UserRole;
  status: Tagged<InvitationStatus, "InvitationStatus">;
  secretHash: InvitationSecretHash | null;
  expiresAt: InvitationExpiry | null;
  acceptedByUserId: User["id"] | null;
  acceptedByEmail: NormalizedEmailAddress | null;
  resolvedAt: InvitationResolvedAt | null;
  providerMessageId: ProviderMessageId | null;
  lastDeliveryError: DeliveryError | null;
  lastDeliveryAttemptAt: DeliveryAttemptedAt | null;
  deliveryEventType: DeliveryEventType | null;
  providerRawEventType: ProviderRawEventType | null;
  providerEventReceivedAt: ProviderEventReceivedAt | null;
  createdAt: Tagged<Date, "CreatedAt">;
  updatedAt: Tagged<Date, "UpdatedAt">;
};
export type InvitationId = Invitation["id"];
export type UserId = User["id"];
export type SentInvitationStatus = Tagged<"sent", "SentInvitationStatus">;
export type RevokedInvitationStatus = Tagged<"revoked", "RevokedInvitationStatus">;
export type ExpiredInvitationStatus = Tagged<"expired", "ExpiredInvitationStatus">;

export type InvitationDeliveryResult =
  | { kind: "accepted_for_delivery"; providerMessageId: ProviderMessageId }
  | { kind: "send_failed"; providerErrorMessage: EmailServiceErrorMessage; providerErrorName?: EmailServiceErrorName };

export type SupportedEmailServiceDeliveryEvent = {
  kind: "delivery_reported";
  deliveryEventType: DeliveryEventType;
  providerMessageId: ProviderMessageId;
  providerRawEventType: ProviderRawEventType;
  receivedAt: ProviderEventReceivedAt;
};

export type IgnoredEmailServiceDeliveryEvent = {
  kind: "ignored";
  providerRawEventType: ProviderRawEventType;
  providerMessageId?: ProviderMessageId | null;
  receivedAt: ProviderEventReceivedAt;
};

export type EmailServiceDeliveryEvent = SupportedEmailServiceDeliveryEvent | IgnoredEmailServiceDeliveryEvent;

export type AuthenticatedDeliveryEventResult = {
  deliveryEventType: DeliveryEventType | null;
  providerRawEventType: ProviderRawEventType;
  persistence: "updated" | "ignored";
};

export type AuthenticatedUser = Pick<User, "id" | "email" | "name">;
export type ListId = List["id"];

export type AcceptedInvitationResolution = { kind: "accepted"; listId: ListId };
export type PendingApprovalInvitationResolution = { kind: "pending_approval"; listId: ListId };
export type TerminalInvitationResolution =
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "already_resolved" };

export type ResolveInviteAcceptanceResult =
  | AcceptedInvitationResolution
  | PendingApprovalInvitationResolution
  | TerminalInvitationResolution;

export type AcceptInvitationWorkflowResult =
  | { kind: "redirect_to_sign_in"; redirectTo: SafeAppPath }
  | ResolveInviteAcceptanceResult;

export type InvitePageOutcome = Exclude<ResolveInviteAcceptanceResult, AcceptedInvitationResolution>;

// ─── Phase 8: Collaborator Management Types ────────────────────────────────

export type InviteCollaboratorResult =
  | { kind: "success"; invitation: SentInvitationSummary }
  | { kind: "failure"; errorMessage: string };

export type SentInvitationSummary = {
  kind: "sent";
  invitationId: InvitationId;
  listId: ListId;
  invitedEmailNormalized: NormalizedEmailAddress;
  expiresAt: InvitationExpiry;
};

export type PendingApprovalInvitationSummary = {
  kind: "pending_approval";
  invitationId: InvitationId;
  listId: ListId;
  invitedEmailNormalized: NormalizedEmailAddress;
  expiresAt: InvitationExpiry;
  /** The user who attempted to accept with a mismatched email */
  acceptedByUserId: UserId;
  /** The email used to sign in (differs from invitedEmailNormalized) */
  acceptedByEmail: NormalizedEmailAddress | null;
};

export type InvitationSummary = SentInvitationSummary | PendingApprovalInvitationSummary;

export type ActorCollaboratorCapabilities = {
  canResend: boolean;
  canRevoke: boolean;
  canCopyLink: boolean;
  canApprove: boolean;
  canReject: boolean;
};

export type InvitationAction =
  | { kind: "resend"; invitationId: InvitationId }
  | { kind: "revoke"; invitationId: InvitationId }
  | { kind: "copy_link"; invitationId: InvitationId }
  | { kind: "approve"; invitationId: InvitationId }
  | { kind: "reject"; invitationId: InvitationId };

export type SentInvitationAction = Extract<InvitationAction, { kind: "resend" | "revoke" | "copy_link" }>;
export type PendingApprovalInvitationAction = Extract<InvitationAction, { kind: "approve" | "reject" }>;

export type AcceptedCollaborator = {
  userId: UserId;
  name: User["name"];
  email: User["email"];
  role: UserRole;
};

export type CollaboratorManagementListView = {
  list: ListWithRole;
  acceptedCollaborators: ReadonlyArray<AcceptedCollaborator>;
  invitations: ReadonlyArray<InvitationSummary>;
};

export type CollaboratorManagementViewData = {
  manageableLists: ReadonlyArray<CollaboratorManagementListView>;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

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
