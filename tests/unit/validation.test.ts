import { describe, expect, it } from "vitest";
import { isValidEmail, sanitizeRedirectTarget } from "@/lib/validation";

describe("validation utilities", () => {
  it("sanitizes protocol-relative redirect targets", () => {
    expect(sanitizeRedirectTarget("//evil.com")).toBe("/");
    expect(sanitizeRedirectTarget("//")).toBe("/");
  });

  it("preserves valid in-app redirect targets", () => {
    expect(sanitizeRedirectTarget("/valid/path")).toBe("/valid/path");
  });

  it("validates basic email shapes", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});
