import { describe, expect, it } from "vitest";

describe("integration smoke", () => {
  it("runs the integration test harness", () => {
    expect(process.env.TEST_SUITE).toBe("integration");
  });
});
