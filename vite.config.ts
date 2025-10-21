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
      "react-dom": "react-dom/client", // Explicitly alias react-dom to react-dom/client
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom/client'],
  },
}));