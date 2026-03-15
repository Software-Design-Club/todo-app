import { fileURLToPath } from "node:url";
import { defineWorkspace } from "vitest/config";

const workspaceRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineWorkspace([
  {
    resolve: {
      alias: {
        "@": workspaceRoot,
      },
    },
    test: {
      name: "unit",
      include: ["tests/unit/**/*.test.ts"],
    },
  },
  {
    esbuild: {
      jsx: "automatic",
      jsxImportSource: "react",
    },
    resolve: {
      alias: {
        "@": workspaceRoot,
      },
    },
    test: {
      name: "component",
      include: ["tests/component/**/*.test.tsx"],
      environment: "happy-dom",
    },
  },
  {
    resolve: {
      alias: {
        "@": workspaceRoot,
      },
    },
    test: {
      name: "integration",
      include: ["tests/integration/**/*.test.ts"],
      poolOptions: {
        threads: {
          isolate: true,
          singleThread: true,
        },
      },
      retry: 2,
      setupFiles: ["tests/setup/integration.ts"],
      hookTimeout: 15000,
      testTimeout: 15000,
    },
  },
]);
