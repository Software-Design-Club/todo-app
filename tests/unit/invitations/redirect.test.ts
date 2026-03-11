import { describe, expect, it } from "vitest";

import {
  buildInviteContinuationTarget,
  normalizeRedirectTarget,
} from "@/lib/invitations/redirect";
import type { InvitationSecret } from "@/lib/types";

describe("normalizeRedirectTarget", () => {
  it('accepts "/"', () => {
    expect(normalizeRedirectTarget("/")).toBe("/");
  });

  it('accepts "/lists/123"', () => {
    expect(normalizeRedirectTarget("/lists/123")).toBe("/lists/123");
  });

  it('rejects "https://evil.com" and returns "/"', () => {
    expect(normalizeRedirectTarget("https://evil.com")).toBe("/");
  });

  it('rejects "//evil.com" and returns "/"', () => {
    expect(normalizeRedirectTarget("//evil.com")).toBe("/");
  });

  it('returns "/" for null', () => {
    expect(normalizeRedirectTarget(null)).toBe("/");
  });

  it('returns "/" for undefined', () => {
    expect(normalizeRedirectTarget(undefined)).toBe("/");
  });

  it('returns "/" for empty string', () => {
    expect(normalizeRedirectTarget("")).toBe("/");
  });

  it('rejects paths with backslashes and returns "/"', () => {
    expect(normalizeRedirectTarget("/foo\\bar")).toBe("/");
  });

  it('rejects relative paths without leading slash and returns "/"', () => {
    expect(normalizeRedirectTarget("foo/bar")).toBe("/");
  });
});

describe("buildInviteContinuationTarget", () => {
  it("produces /invite?token=... for a given secret", () => {
    const secret = "test-secret-value" as InvitationSecret;
    const result = buildInviteContinuationTarget(secret);

    expect(result).toBe("/invite?token=test-secret-value");
  });

  it("does not produce absolute URLs", () => {
    const secret = "another-secret" as InvitationSecret;
    const result = buildInviteContinuationTarget(secret);

    expect(result).not.toContain("://");
    expect(result).toMatch(/^\//);
  });

  it("URL-encodes special characters in the token", () => {
    const secret = "secret+with/special=chars" as InvitationSecret;
    const result = buildInviteContinuationTarget(secret);

    expect(result).toContain("/invite?token=");
    // URLSearchParams encodes + as %2B
    expect(result).toContain("%2B");
  });
});
