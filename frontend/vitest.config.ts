import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { sharedSourceAliases } from "./sharedSourceAliases";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: sharedSourceAliases,
  },
});
