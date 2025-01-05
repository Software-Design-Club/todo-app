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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});



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
    .references(() => ListsTable.id)
    .notNull(),
  status: todoStatusEnum("status").default("not started").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
