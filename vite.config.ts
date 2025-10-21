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
      // Make the react-dom alias even more explicit by pointing directly to the client entry
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom/client"),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom/client'],
  },
}));