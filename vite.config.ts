import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// GitHub Pages serves the site from /qlock/. Three pages share one bundle of
// components: the clock, the about page, and the design system sheet.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        about: resolve(__dirname, "about.html"),
        system: resolve(__dirname, "system.html"),
      },
      output: {
        // three, katex and react change rarely, so they cache separately from app code
        manualChunks: { three: ["three"], katex: ["katex"], react: ["react", "react-dom"] },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
