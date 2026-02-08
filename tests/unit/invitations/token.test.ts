import { describe, expect, it } from "vitest";
import {
  generateInvitationToken,
  getInvitationExpiry,
  hashInvitationToken,
  isInvitationExpired,
} from "@/lib/invitations/token";

describe("invitation token utilities", () => {
  it("hashes tokens deterministically", () => {
    const token = "example-token";
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
  });

  it("generates token and hash pairs", () => {
    const generated = generateInvitationToken();
    expect(generated.token.length).toBeGreaterThan(20);
    expect(generated.tokenHash).toBe(hashInvitationToken(generated.token));
  });

  it("detects expiration windows", () => {
    const now = new Date("2026-02-08T12:00:00.000Z");
    const expiresAt = getInvitationExpiry(now);
    expect(isInvitationExpired(expiresAt, now)).toBe(false);
    expect(
      isInvitationExpired(expiresAt, new Date(expiresAt.getTime() + 1))
    ).toBe(true);
  });
});
