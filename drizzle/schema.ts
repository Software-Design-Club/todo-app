import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
  integer,
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

export const InvitationStatusEnum = pgEnum("invitation_status", [
  "sent",
  "accepted",
  "pending_owner_approval",
  "revoked",
  "expired",
]);

export const ListCollaboratorsTable = pgTable(
  "list_collaborators",
  {
    id: serial("id").primaryKey(),
    listId: integer("listId")
      .references(() => ListsTable.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("userId").references(() => UsersTable.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
    role: CollaboratorRoleEnum("role").default("collaborator").notNull(),
    inviteStatus: InvitationStatusEnum("inviteStatus")
      .default("accepted")
      .notNull(),
    invitedEmailNormalized: text("invitedEmailNormalized"),
    inviteTokenHash: text("inviteTokenHash"),
    inviteExpiresAt: timestamp("inviteExpiresAt"),
    inviterId: integer("inviterId").references(() => UsersTable.id),
    inviteSentAt: timestamp("inviteSentAt"),
    inviteAcceptedAt: timestamp("inviteAcceptedAt"),
    inviteRevokedAt: timestamp("inviteRevokedAt"),
    inviteExpiredAt: timestamp("inviteExpiredAt"),
    ownerApprovalRequestedAt: timestamp("ownerApprovalRequestedAt"),
    ownerApprovedBy: integer("ownerApprovedBy").references(() => UsersTable.id),
    ownerApprovedAt: timestamp("ownerApprovedAt"),
    ownerRejectedBy: integer("ownerRejectedBy").references(() => UsersTable.id),
    ownerRejectedAt: timestamp("ownerRejectedAt"),
    emailDeliveryStatus: text("emailDeliveryStatus"),
    emailDeliveryError: text("emailDeliveryError"),
    emailDeliveryProviderId: text("emailDeliveryProviderId"),
    emailLastSentAt: timestamp("emailLastSentAt"),
  },
  (collaborators) => {
    return {
      pk: uniqueIndex("list_collaborators_pk").on(
        collaborators.listId,
        collaborators.userId
      ),
      acceptedMembershipUnique: uniqueIndex(
        "list_collaborators_accepted_membership_unique"
      )
        .on(collaborators.listId, collaborators.userId)
        .where(
          sql`${collaborators.inviteStatus} = 'accepted' AND ${collaborators.userId} IS NOT NULL`
        ),
      openInviteEmailUnique: uniqueIndex(
        "list_collaborators_open_invite_email_unique"
      )
        .on(collaborators.listId, collaborators.invitedEmailNormalized)
        .where(
          sql`${collaborators.inviteStatus} IN ('sent', 'pending_owner_approval') AND ${collaborators.invitedEmailNormalized} IS NOT NULL`
        ),
      inviteTokenHashIndex: index("list_collaborators_invite_token_hash_idx").on(
        collaborators.inviteTokenHash
      ),
    };
  }
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
