import "server-only";

import { auth } from "@/auth";
import type { User } from "@/lib/types";

export interface AuthenticatedSession {
  user: {
    id: User["id"];
    email: User["email"];
    name: User["name"];
  };
}

export async function requireAuth(): Promise<AuthenticatedSession> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Authentication required.");
  }

  if (!session.user.email) {
    throw new Error("Authentication required: missing email.");
  }

  return session as AuthenticatedSession;
}
