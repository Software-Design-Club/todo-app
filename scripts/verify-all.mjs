import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const verificationCommands = [
  "npm run verify:env",
  "npm run typecheck",
  "npm run lint",
  "npm run test:unit",
  "npm run test:integration",
  "npm run test:e2e:smoke",
];

export async function runVerificationCommands(runCommand = defaultRunCommand) {
  for (const command of verificationCommands) {
    await runCommand(command);
  }
}

async function defaultRunCommand(command) {
  execSync(command, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await runVerificationCommands();
}
