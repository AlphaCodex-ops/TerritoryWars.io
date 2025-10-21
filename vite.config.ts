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
      // Removed explicit 'react-dom' alias to allow Vite to resolve 'react-dom/client' naturally
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom/client'],
  },
}));