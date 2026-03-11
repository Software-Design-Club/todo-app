import NextAuth, { type DefaultSession, type Session } from "next-auth";
import Github from "next-auth/providers/github";
import { cookies } from "next/headers";
import {
  findOrCreateAccount,
  getUser,
} from "@/app/sign-in/_components/_actions/find-or-create-account";
import type { User } from "@/lib/types";

const E2E_AUTH_COOKIE_NAME = "todo-e2e-auth-email";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: User;
  }
}

const nextAuth = NextAuth({
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

async function getE2ETestSession(): Promise<Session | null> {
  if (
    process.env.E2E_AUTH_ENABLED !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    return null;
  }

  const cookieStore = await cookies();
  const email = cookieStore.get(E2E_AUTH_COOKIE_NAME)?.value?.trim();

  if (!email) {
    return null;
  }

  const dbUser = await getUser(email);

  if (!dbUser?.id) {
    return null;
  }

  return {
    user: {
      ...dbUser,
      image: undefined,
    },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

export const { handlers, signIn, signOut } = nextAuth;
export const middlewareAuth = nextAuth.auth;

export async function auth() {
  const e2eSession = await getE2ETestSession();

  if (e2eSession) {
    return e2eSession;
  }

  return nextAuth.auth();
}
