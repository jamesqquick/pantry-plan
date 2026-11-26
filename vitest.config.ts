import { defineConfig } from "vitest/config";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromAstro = createRequire(import.meta.resolve("astro/package.json"));

export default defineConfig({
  plugins: [
    {
      name: "test-astro-ssr",
      transform(source, id) {
        if (!id.endsWith(".astro")) return;
        const { transform } = requireFromAstro("@astrojs/compiler-rs");
        return transform(source, {
          filename: id,
          internalURL: "astro/compiler-runtime",
          inlineComponentAssets: true,
          resultScopedSlot: true,
          resolvePath: (specifier: string) => specifier,
        }).code;
      },
    },
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
