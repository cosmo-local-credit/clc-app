import { defineConfig } from "vite-plus";

// Node-only build tooling shared by both apps' Vite configs and CI.
export default defineConfig({
  test: { name: "tooling", environment: "node" },
});
