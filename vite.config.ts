import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths, so the built site works from any folder (or straight off disk via a static server).
  base: "./",
  worker: { format: "es" },
  assetsInclude: ["**/*.bin"],
  // Off Vite's default 5173 so it never collides with work dev servers; strictPort fails loudly instead of drifting.
  server: { host: "127.0.0.1", port: 5290, strictPort: true },
  preview: { host: "127.0.0.1", port: 5291, strictPort: true },
});
