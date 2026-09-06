import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Moods",
        short_name: "Moods",
        theme_color: "#14110f",
        background_color: "#14110f",
        display: "standalone",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    }),
  ],
});
