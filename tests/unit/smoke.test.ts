import { describe, expect, it } from "vitest";

describe("unit smoke", () => {
  it("runs the unit test harness", () => {
    expect(1 + 1).toBe(2);
    expect(process.env.TEST_SUITE).toBe("unit");
  });
});
