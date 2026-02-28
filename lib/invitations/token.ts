import { createHash, randomBytes } from "node:crypto";
import type { InviteToken, InviteTokenHash } from "@/lib/types";
import {
  createTaggedInviteToken,
  createTaggedInviteTokenHash,
} from "@/lib/types";

export const INVITATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInvitationToken(token: string): InviteTokenHash {
  return createTaggedInviteTokenHash(
    createHash("sha256").update(token).digest("hex")
  );
}

export function generateInvitationToken(): {
  token: InviteToken;
  tokenHash: InviteTokenHash;
} {
  const token = createTaggedInviteToken(randomBytes(32).toString("base64url"));
  return {
    token,
    tokenHash: hashInvitationToken(token),
  };
}

export function getInvitationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITATION_TOKEN_TTL_MS);
}

export function isInvitationExpired(
  expiresAt: Date | null,
  now: Date = new Date()
): boolean {
  if (!expiresAt) {
    return true;
  }
  return expiresAt.getTime() <= now.getTime();
}
