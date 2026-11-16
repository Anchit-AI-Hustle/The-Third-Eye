import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    // The existing provider tests cover the paid paths, which are off by default now.
    // freeOnly.test.ts removes this (NODE_ENV=test only; production cannot) to test the default.
    env: { PAID_PATH_TESTS: "1" },
    css: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // What Next resolves it to in server bundles; tests run server code directly.
      "server-only": "next/dist/compiled/server-only/empty.js",
    },
  },
});
