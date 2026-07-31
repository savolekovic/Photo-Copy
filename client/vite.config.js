import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
  },
  server: {
    port: 5173,
    // ngrok sends a non-localhost Host header (Vite 6 validates it)
    allowedHosts: [
      ".ngrok-free.app",
      ".ngrok-free.dev",
      ".ngrok.io",
      "localhost",
    ],
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
