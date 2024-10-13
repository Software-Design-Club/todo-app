import NextAuth from "next-auth";
import Github from "next-auth/providers/github";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { UsersTable } from "./drizzle/schema";

import { eq } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Github],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // User is available during sign-in
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      return session;
    },
    async signIn(params) {
      const user = params.user;
      if (!user.email) {
        return false;
      }
      const db = await drizzle(sql);
      const findUser = await db
        .select()
        .from(UsersTable)
        .where(eq(UsersTable.email, user.email));

      if (findUser.length === 0) {
        await db
          .insert(UsersTable)
          .values({ email: user.email, name: user.name || user.email });
      }
      return true;
    },
  },
});
