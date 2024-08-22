// vite.config.js
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: resolve(__dirname, "src/main.js"),
      name: "dither-dither",
      fileName: "dither-dither",
    },
  },
});
