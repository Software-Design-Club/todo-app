import { createHash, randomBytes } from "node:crypto";

import type { InvitationSecret, InvitationSecretHash } from "@/lib/types";

/**
 * @module invitation token contracts
 *
 * Provides opaque invitation bearer secrets and deterministic secret hashing
 * for persisted invitation lookup.
 */

/**
 * @contract createInvitationSecret
 *
 * Returns a non-empty opaque secret suitable for use in an invitation URL.
 * The caller can treat it as one-time bearer material.
 */
export function createInvitationSecret(): InvitationSecret {
  return randomBytes(32).toString("base64url") as InvitationSecret;
}

/**
 * @contract hashInvitationSecret
 *
 * Deterministic: equal secrets produce equal hashes.
 * Stable across a single deployment for persisted lookup behavior.
 */
export function hashInvitationSecret(
  secret: InvitationSecret,
): InvitationSecretHash {
  return createHash("sha256")
    .update(secret)
    .digest("hex") as InvitationSecretHash;
}
