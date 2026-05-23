import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Dev: proxy /v1beta/* to either a local `node server.js` on :8080 or the
// deployed Cloud Run URL (via VITE_DEV_PROXY). Prod: same-origin, no proxy.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_PROXY ?? "http://localhost:8080";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/v1beta": { target: apiTarget, changeOrigin: true },
      },
    },
    build: { target: "es2022", sourcemap: true },
  };
});
