import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  plugins: [
    {
      name: "test-astro-actions",
      resolveId(id) {
        return id === "astro:actions" ? "\0astro:actions" : undefined;
      },
      load(id) {
        return id === "\0astro:actions"
          ? "export const actions = {};"
          : undefined;
      },
    },
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
