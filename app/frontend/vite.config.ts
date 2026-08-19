import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Built dist/ is served by the TS server on :3200. Dev server proxies API to it.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:3200", "/data": "http://127.0.0.1:3200" } },
  build: { outDir: "dist" },
});
