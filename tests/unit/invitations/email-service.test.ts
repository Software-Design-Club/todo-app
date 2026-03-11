import { afterEach, describe, expect, it, vi } from "vitest";

import {
  sendInvitationEmail,
  setEmailServiceForTesting,
} from "@/lib/email/service";
import {
  listStubInvitationDeliveries,
  resetStubInvitationMailbox,
} from "@/lib/email/test-stub";

afterEach(() => {
  setEmailServiceForTesting(null);
  vi.unstubAllEnvs();
});

describe("sendInvitationEmail", () => {
  it("validates required email configuration before delivery", async () => {
    const sendInvitationEmailSpy = vi.fn();

    setEmailServiceForTesting({
      sendInvitationEmail: sendInvitationEmailSpy,
    });
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "owner@example.com");
    vi.stubEnv("APP_BASE_URL", "https://example.com");

    await expect(
      sendInvitationEmail({
        invitationId: 123 as never,
        acceptanceUrl: "https://example.com/invite?token=secret" as never,
      }),
    ).rejects.toThrow("Missing required env var: RESEND_API_KEY");
    expect(sendInvitationEmailSpy).not.toHaveBeenCalled();
  });

  it("delegates to the configured EmailService exactly once and returns accepted responses unchanged", async () => {
    const acceptedResponse = {
      kind: "accepted" as const,
      providerMessageId: "provider-message-123" as never,
    };
    const sendInvitationEmailSpy = vi
      .fn()
      .mockResolvedValue(acceptedResponse);

    setEmailServiceForTesting({
      sendInvitationEmail: sendInvitationEmailSpy,
    });
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("EMAIL_FROM", "owner@example.com");
    vi.stubEnv("APP_BASE_URL", "https://example.com");

    await expect(
      sendInvitationEmail({
        invitationId: 123 as never,
        acceptanceUrl: "https://example.com/invite?token=secret" as never,
      }),
    ).resolves.toEqual(acceptedResponse);
    expect(sendInvitationEmailSpy).toHaveBeenCalledTimes(1);
  });

  it("returns failed EmailService responses unchanged", async () => {
    const rejectedResponse = {
      kind: "rejected" as const,
      errorMessage: "provider failed" as never,
      errorName: "ProviderError" as never,
    };

    setEmailServiceForTesting({
      sendInvitationEmail: vi.fn().mockResolvedValue(rejectedResponse),
    });
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("EMAIL_FROM", "owner@example.com");
    vi.stubEnv("APP_BASE_URL", "https://example.com");

    await expect(
      sendInvitationEmail({
        invitationId: 456 as never,
        acceptanceUrl: "https://example.com/invite?token=secret" as never,
      }),
    ).resolves.toEqual(rejectedResponse);
  });

  it("uses the test-stub EmailService boundary in test mode", async () => {
    await resetStubInvitationMailbox();
    vi.stubEnv("RESEND_API_KEY", "resend-key");
    vi.stubEnv("EMAIL_FROM", "owner@example.com");
    vi.stubEnv("APP_BASE_URL", "https://example.com");

    const response = await sendInvitationEmail({
      invitationId: 789 as never,
      acceptanceUrl: "https://example.com/invite?token=stubbed" as never,
    });

    await expect(listStubInvitationDeliveries()).resolves.toEqual([
      expect.objectContaining({
        invitationId: 789,
        acceptanceUrl: "https://example.com/invite?token=stubbed",
      }),
    ]);
    expect(response).toEqual({
      kind: "accepted",
      providerMessageId: "test-stub-789",
    });
  });
});
