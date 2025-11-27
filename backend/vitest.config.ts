import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      // Load from .env.test if it exists, or use defaults
      SESSION_SECRET:
        process.env.SESSION_SECRET || "test-secret-key-min-32-chars-long-for-testing",
      TEST_API_URL: process.env.TEST_API_URL || "http://localhost:8787",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "src/__tests__/",
        "scripts/",
        "*.config.ts",
      ],
    },
  },
});
