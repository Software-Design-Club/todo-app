import path from "node:path";
import { defineConfig } from "vitest/config";

const suite = process.env.VITEST_SUITE;

const includeBySuite: Record<string, string[]> = {
  unit: ["tests/unit/**/*.test.ts"],
  integration: ["tests/integration/**/*.test.ts"],
};

const setupFileBySuite: Record<string, string[]> = {
  unit: ["tests/setup/unit.ts"],
  integration: ["tests/setup/integration.ts"],
};

const include = includeBySuite[suite ?? ""] ?? ["tests/**/*.test.ts"];
const setupFiles = setupFileBySuite[suite ?? ""] ?? ["tests/setup/unit.ts"];

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include,
    setupFiles,
    passWithNoTests: false,
  },
});
