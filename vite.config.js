import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    base: "/",
    define: {
      __STORE_URL__: JSON.stringify(env.VITE_STORE_URL),
      __CONSUMER_KEY__: JSON.stringify(env.VITE_CONSUMER_KEY),
      __CONSUMER_SECRET__: JSON.stringify(env.VITE_CONSUMER_SECRET),
      __AUTH_USERNAME__: JSON.stringify(env.VITE_AUTH_USERNAME),
      __AUTH_PASSWORD__: JSON.stringify(env.VITE_AUTH_PASSWORD),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom"],
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
