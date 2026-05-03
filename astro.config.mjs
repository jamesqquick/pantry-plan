// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: cloudflare({
    // Auto-configures Workers KV for Astro sessions
    // Default sessionKVBindingName is 'SESSION'
  }),
  // Astro Actions default body limit is 1 MB, which rejects recipe-image
  // uploads (4 MB raw -> ~5.4 MB after base64). Bump to 10 MB for headroom.
  // Cloudflare Workers (Free plan) allows up to 100 MB request bodies.
  security: {
    actionBodySizeLimit: 10 * 1024 * 1024, // 10 MB
  },
  integrations: [react()],
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Be Vietnam Pro",
      cssVariable: "--font-body",
      weights: ["400", "500", "600", "700"],
      styles: ["normal"],
      subsets: ["latin"],
    },
    {
      provider: fontProviders.google(),
      name: "Lilita One",
      cssVariable: "--font-display",
      weights: ["400"],
      styles: ["normal"],
      subsets: ["latin"],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    ssr: {
      // Ensure React is resolved once during SSR so the dispatcher is
      // never null when islands call hooks. Without this, Vite's SSR
      // dep-optimization can occasionally create a stale chunk where
      // ReactSharedInternals.H is null, causing the intermittent
      // "Cannot read properties of null (reading 'useState')" error.
      noExternal: ["better-auth"],
    },
  },
});
