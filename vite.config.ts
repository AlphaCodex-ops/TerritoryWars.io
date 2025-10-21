import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Explicitly alias react to ensure a single instance
      "react": path.resolve(__dirname, "node_modules/react"),
      // Removed the problematic "react-dom" alias
    },
  },
}));