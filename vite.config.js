import { defineConfig } from "vite";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  server: {
    allowedHosts: [".trycloudflare.com"],
    proxy: { "/api": "http://localhost:3001" },
  },
});
