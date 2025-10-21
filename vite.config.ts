import { defineConfig } from "vite";
// import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger"; // Temporarily removed
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [/* dyadComponentTagger(), */ react()], // Temporarily removed dyadComponentTagger
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));