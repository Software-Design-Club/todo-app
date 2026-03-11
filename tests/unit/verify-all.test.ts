import { describe, expect, it } from "vitest";
import {
  runVerificationCommands,
  verificationCommands,
} from "../../scripts/verify-all.mjs";

describe("verify:all command", () => {
  it("runs the verification commands in the documented order", async () => {
    const executed: string[] = [];

    await runVerificationCommands(async (command) => {
      executed.push(command);
    });

    expect(executed).toEqual(verificationCommands);
  });

  it("stops at the first failing verification command", async () => {
    const executed: string[] = [];
    const failure = new Error("typecheck failed");

    await expect(
      runVerificationCommands(async (command) => {
        executed.push(command);

        if (command === "npm run typecheck") {
          throw failure;
        }
      }),
    ).rejects.toThrow(failure);

    expect(executed).toEqual(["npm run verify:env", "npm run typecheck"]);
  });
});
