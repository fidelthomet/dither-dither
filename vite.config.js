// vite.config.js
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/main.js"),
      fileName: "dither-dither",
      formats: ["es"],
    },
  },
});
