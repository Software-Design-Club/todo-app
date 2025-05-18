import NextAuth from "next-auth";
import Github from "next-auth/providers/github";
import { findOrCreateAccount } from "@/app/sign-in/_components/_actions/find-or-create-account";

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
      await findOrCreateAccount({
        email: user.email,
        name: user.name || user.email,
      });
      return true;
    },
  },
});
