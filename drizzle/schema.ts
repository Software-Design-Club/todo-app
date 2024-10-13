import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  pgEnum,
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
