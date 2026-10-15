
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const proxyConfig = {
    "^/auth/": {
      target: "http://127.0.0.1:8000",
      changeOrigin: true,
      bypass: (req: any) => {
        if (
          req.url?.startsWith("/auth/callback") ||
          (req.headers.accept && req.headers.accept.includes("text/html"))
        ) {
          return "/index.html";
        }
      },
    },
    "^/api/": {
      target: "http://127.0.0.1:8000",
      changeOrigin: true,
    },
    "^/health": {
      target: "http://127.0.0.1:8000",
      changeOrigin: true,
    },
  };

  return {
    server: {
      host: "0.0.0.0",
      port: 8080,
      strictPort: true,
      allowedHosts: ["engine-crestless-happy.ngrok-free.dev"],
      proxy: proxyConfig,
    },
    preview: {
      port: 4173,
      host: "0.0.0.0",
      proxy: proxyConfig,
    },
    build: {
      target: "esnext",
      cssCodeSplit: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
