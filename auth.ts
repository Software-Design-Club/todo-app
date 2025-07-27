import NextAuth, { type DefaultSession } from "next-auth";
import Github from "next-auth/providers/github";
import {
  findOrCreateAccount,
  getUser,
} from "@/app/sign-in/_components/_actions/find-or-create-account";
import type { User } from "@/lib/types";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: User;
  }
}

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
    async session({ session }) {
      const dbUser = await getUser(session.user.email);
      if (!dbUser?.id) {
        throw new Error("User not found");
      }
      return {
        ...session,
        user: {
          ...dbUser,
          image: session.user.image,
        },
      };
    },
    async signIn(params) {
      const user = params.user;
      if (!user.email) {
        return false;
      }
      await findOrCreateAccount({
        email: user.email,
        name: user.name,
      });
      return true;
    },
  },
});
