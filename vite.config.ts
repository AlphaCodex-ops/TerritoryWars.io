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
      // Explicitly alias 'react-dom' to 'react-dom/client'
      "react-dom": "react-dom/client",
    },
  },
  optimizeDeps: {
    // Removed 'react-dom' from include, relying on the alias to handle resolution
    include: ['react', 'react-dom/client'],
  },
}));