import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  pgEnum,
  integer,
} from "drizzle-orm/pg-core";

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
