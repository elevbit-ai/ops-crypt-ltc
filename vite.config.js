import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  build: {
    outDir: "../app",
    emptyOutDir: true,
    sourcemap: false,
    target: "esnext",
  },
  plugins: [
    nodePolyfills({
      include: ["buffer", "process", "stream", "util"],
      globals: { Buffer: true, global: true, process: true },
    }),
    wasm(),
    topLevelAwait(),
  ],
  server: {
    port: 8080,
    host: true,
  },
});
