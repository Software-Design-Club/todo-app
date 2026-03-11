import { describe, expect, it } from "vitest";

import { buildInvitationAcceptanceUrl } from "@/lib/invitations/service";
import {
  createInvitationSecret,
  hashInvitationSecret,
} from "@/lib/invitations/token";

describe("invitation token contracts", () => {
  it("creates a non-empty opaque invitation secret", () => {
    const secret = createInvitationSecret();

    expect(secret).toBeTypeOf("string");
    expect(secret.length).toBeGreaterThan(0);
  });

  it("hashes equal invitation secrets identically", () => {
    const secret = "same-secret" as ReturnType<typeof createInvitationSecret>;

    expect(hashInvitationSecret(secret)).toBe(hashInvitationSecret(secret));
  });

  it("builds the canonical absolute /invite URL for a secret", () => {
    expect(
      buildInvitationAcceptanceUrl({
        appBaseUrl: "https://example.com/app" as never,
        secret: "opaque-secret" as never,
      }),
    ).toBe("https://example.com/invite?token=opaque-secret");
  });
});
