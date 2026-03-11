import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  integer,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userStatusEnum = pgEnum("status", ["active", "deleted"]);

export const ListVisibilityEnum = pgEnum("list_visibility", [
  "private",
  "public",
]);

export const ListStateEnum = pgEnum("list_state", ["active", "archived"]);

export const UsersTable = pgTable(
  "todo_users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    status: userStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (users) => {
    return {
      uniqueIdx: uniqueIndex("unique_idx").on(users.email),
    };
  }
);

export const ListsTable = pgTable("lists", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  creatorId: integer("creatorId")
    .references(() => UsersTable.id)
    .notNull(),
  visibility: ListVisibilityEnum("visibility").default("private").notNull(),
  state: ListStateEnum("state").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const CollaboratorRoleEnum = pgEnum("collaborator_role", [
  "owner",
  "collaborator",
]);

export const InvitationStatusEnum = pgEnum("invitation_lifecycle_status", [
  "pending",
  "sent",
  "accepted",
  "pending_approval",
  "revoked",
  "expired",
]);

export const InvitationDeliveryEventTypeEnum = pgEnum(
  "invitation_delivery_event_type",
  ["failed", "bounced", "delayed", "complained"],
);

export const ListCollaboratorsTable = pgTable(
  "list_collaborators",
  {
    id: serial("id").primaryKey(),
    listId: integer("listId")
      .references(() => ListsTable.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("userId")
      .references(() => UsersTable.id)
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    role: CollaboratorRoleEnum("role").default("collaborator").notNull(),
  },
  (collaborators) => {
    return {
      pk: uniqueIndex("list_collaborators_pk").on(
        collaborators.listId,
        collaborators.userId
      ),
    };
  }
);

/**
 * @contract InvitationsTable
 *
 * The `invitations` table manages the full invitation lifecycle independently
 * from `list_collaborators`. Each row represents one invitation attempt or a
 * migrated legacy invitation audit record.
 *
 * @invariants
 * - Open invitations (`pending`, `sent`) must retain inviter, email, secret,
 *   and expiry material required for later acceptance.
 * - `pending_approval` rows require `acceptedByUserId`.
 * - `accepted` rows require `acceptedByUserId` and `resolvedAt`.
 * - `revoked` and `expired` rows require `resolvedAt`.
 * - `acceptedByEmail`, when present, records a sign-in email that differs from
 *   the invited email.
 * - Delivery columns store only the latest delivery attempt and latest provider
 *   event.
 */
export const InvitationsTable = pgTable(
  "invitations",
  {
    id: serial("id").primaryKey(),
    listId: integer("listId")
      .references(() => ListsTable.id, { onDelete: "cascade" })
      .notNull(),
    inviterId: integer("inviterId").references(() => UsersTable.id),
    invitedEmailNormalized: text("invitedEmailNormalized"),
    role: CollaboratorRoleEnum("role").default("collaborator").notNull(),
    status: InvitationStatusEnum("status").notNull(),
    secretHash: text("secretHash"),
    expiresAt: timestamp("expiresAt"),
    acceptedByUserId: integer("acceptedByUserId").references(
      () => UsersTable.id,
    ),
    acceptedByEmail: text("acceptedByEmail"),
    resolvedAt: timestamp("resolvedAt"),
    providerMessageId: text("providerMessageId"),
    lastDeliveryError: text("lastDeliveryError"),
    lastDeliveryAttemptAt: timestamp("lastDeliveryAttemptAt"),
    deliveryEventType: InvitationDeliveryEventTypeEnum("deliveryEventType"),
    providerRawEventType: text("providerRawEventType"),
    providerEventReceivedAt: timestamp("providerEventReceivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (invitations) => {
    return {
      listStatusIdx: index("invitations_list_id_status_idx").on(
        invitations.listId,
        invitations.status,
      ),
      secretHashIdx: index("invitations_secret_hash_idx").on(
        invitations.secretHash,
      ),
      listEmailStatusIdx: index("invitations_list_email_status_idx").on(
        invitations.listId,
        invitations.invitedEmailNormalized,
        invitations.status,
      ),
      openInvitationUniqueIdx: uniqueIndex(
        "invitations_open_email_unique_idx",
      )
        .on(invitations.listId, invitations.invitedEmailNormalized)
        .where(sql`${invitations.status} in ('pending', 'sent')`),
      openInvitationRequiresCoreFields: check(
        "invitations_open_requires_core_fields",
        sql`${invitations.status} not in ('pending', 'sent') or (
          ${invitations.inviterId} is not null and
          ${invitations.invitedEmailNormalized} is not null and
          ${invitations.secretHash} is not null and
          ${invitations.expiresAt} is not null and
          ${invitations.acceptedByUserId} is null and
          ${invitations.acceptedByEmail} is null and
          ${invitations.resolvedAt} is null
        )`,
      ),
      pendingApprovalRequiresAcceptedByUserId: check(
        "invitations_pending_approval_requires_acceptor",
        sql`${invitations.status} <> 'pending_approval' or ${invitations.acceptedByUserId} is not null`,
      ),
      acceptedRequiresAcceptedByUserIdAndResolvedAt: check(
        "invitations_accepted_requires_acceptor_and_resolved_at",
        sql`${invitations.status} <> 'accepted' or (
          ${invitations.acceptedByUserId} is not null and
          ${invitations.resolvedAt} is not null
        )`,
      ),
      terminalRequiresResolvedAt: check(
        "invitations_terminal_requires_resolved_at",
        sql`${invitations.status} not in ('revoked', 'expired') or ${invitations.resolvedAt} is not null`,
      ),
      acceptedByEmailCapturesMismatchOnly: check(
        "invitations_accepted_by_email_tracks_mismatch",
        sql`${invitations.acceptedByEmail} is null or ${invitations.acceptedByEmail} <> ${invitations.invitedEmailNormalized}`,
      ),
    };
  },
);

export const todoStatusEnum = pgEnum("todo_status", [
  "not started",
  "in progress",
  "done",
  "deleted",
]);

export const TodosTable = pgTable("todos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  listId: integer("listId")
    .references(() => ListsTable.id, { onDelete: "cascade" })
    .notNull(),
  status: todoStatusEnum("status").default("not started").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
