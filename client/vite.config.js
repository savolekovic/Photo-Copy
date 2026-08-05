import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom"],
  },
  server: {
    port: 5173,
    // Vite 6 validates the Host header, so any tunnel domain used to reach the dev
    // server has to be listed or it answers "Blocked request".
    allowedHosts: [
      ".ngrok-free.app",
      ".ngrok-free.dev",
      ".ngrok.io",
      ".trycloudflare.com",
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
