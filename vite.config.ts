import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  envPrefix: ["VITE_", "REACT_APP_"],
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://127.0.0.1:4000",
        ws: true,
        changeOrigin: true,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Raise the chunk-size warning threshold so the dev build doesn't spam,
    // but production chunks below are explicitly split via manualChunks.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split vendor libs into separate cacheable chunks.
        // React+Router in one, maps in another, charts/three in another,
        // radix UI primitives in another. This lets the browser cache
        // vendor code across deploys that don't change deps.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "ui-vendor": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-toast",
          ],
          "data-vendor": ["@tanstack/react-query", "zustand", "axios"],
          "maps-vendor": ["leaflet", "react-leaflet", "@react-google-maps/api"],
          "chart-vendor": ["recharts", "chart.js", "framer-motion"],
          "three-vendor": ["three", "@react-three/fiber", "@react-three/drei", "@react-three/rapier"],
        },
      },
    },
  },
}));
