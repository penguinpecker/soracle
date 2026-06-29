import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // snarkjs / ffjavascript need Buffer + process in the browser (used only in the worker)
    nodePolyfills({
      include: ["buffer", "process", "util", "stream"],
      globals: { Buffer: true, process: true },
    }),
  ],
  define: { global: "globalThis" },
  optimizeDeps: { include: ["snarkjs"] },
  build: { target: "es2022" }, // top-level await
  worker: { format: "es" },
});
