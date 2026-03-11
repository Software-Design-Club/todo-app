import type { InvitationSecret, SafeAppPath } from "@/lib/types";

const DEFAULT_PATH = "/" as SafeAppPath;

/**
 * @contract normalizeRedirectTarget (Contract 6.2)
 *
 * Returns a safe app-relative path. Rejects absolute URLs, cross-origin,
 * protocol-relative (//) paths, and backslash-containing paths.
 * Returns "/" as the default for any invalid input.
 */
export function normalizeRedirectTarget(
  raw: string | null | undefined,
): SafeAppPath {
  if (!raw || typeof raw !== "string") {
    return DEFAULT_PATH;
  }

  const trimmed = raw.trim();

  if (!trimmed || !trimmed.startsWith("/")) {
    return DEFAULT_PATH;
  }

  if (trimmed.startsWith("//")) {
    return DEFAULT_PATH;
  }

  if (trimmed.includes("://")) {
    return DEFAULT_PATH;
  }

  if (trimmed.includes("\\")) {
    return DEFAULT_PATH;
  }

  return trimmed as SafeAppPath;
}

/**
 * @contract buildInviteContinuationTarget (Contract 6.3)
 *
 * Returns `/invite?token=<secret>` as a SafeAppPath.
 */
export function buildInviteContinuationTarget(
  secret: InvitationSecret,
): SafeAppPath {
  const params = new URLSearchParams({ token: secret });
  return `/invite?${params.toString()}` as SafeAppPath;
}
