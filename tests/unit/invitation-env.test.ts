import { describe, expect, it } from "vitest";
import { verifyInvitationEnv } from "@/lib/invitations/env";

describe("verifyInvitationEnv", () => {
  it("returns normalized invitation configuration for a valid environment", () => {
    const env = {
      RESEND_API_KEY: "  resend-key  ",
      EMAIL_FROM: "  Owner@Example.com  ",
      APP_BASE_URL: "https://example.com/app/  ",
      NODE_ENV: "test",
    } as unknown as NodeJS.ProcessEnv;

    expect(
      verifyInvitationEnv(env),
    ).toEqual({
      resendApiKey: "resend-key",
      emailFrom: "owner@example.com",
      appBaseUrl: "https://example.com/app",
    });
  });

  it("names a missing required key in the thrown error", () => {
    const env = {
      EMAIL_FROM: "owner@example.com",
      APP_BASE_URL: "https://example.com",
      NODE_ENV: "test",
    } as unknown as NodeJS.ProcessEnv;

    expect(() => verifyInvitationEnv(env)).toThrow(
      "Missing required env var: RESEND_API_KEY",
    );
  });

  it("rejects non-http application base URLs by key and reason", () => {
    const env = {
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "owner@example.com",
      APP_BASE_URL: "ftp://example.com",
      NODE_ENV: "test",
    } as unknown as NodeJS.ProcessEnv;

    expect(() => verifyInvitationEnv(env)).toThrow(
      "Invalid env var APP_BASE_URL: must use http or https",
    );
  });

  it("names the offending key and reason for invalid email values", () => {
    const env = {
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "not-an-email",
      APP_BASE_URL: "https://example.com",
      NODE_ENV: "test",
    } as unknown as NodeJS.ProcessEnv;

    expect(() => verifyInvitationEnv(env)).toThrow(
      "Invalid env var EMAIL_FROM: must be a valid email address",
    );
  });

  it("keeps the webhook secret optional", () => {
    const env = {
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "owner@example.com",
      APP_BASE_URL: "http://localhost:3000/",
      NODE_ENV: "test",
    } as unknown as NodeJS.ProcessEnv;

    expect(verifyInvitationEnv(env)).toEqual({
      resendApiKey: "resend-key",
      emailFrom: "owner@example.com",
      appBaseUrl: "http://localhost:3000",
      resendWebhookSecret: undefined,
    });
  });
});
