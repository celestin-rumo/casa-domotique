import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Des chemins relatifs, pas absolus. Sur le Pi, Home Assistant sert l'app
  // depuis /config/www, donc sous /local/casa/ et non à la racine : avec le
  // « / » par défaut, la page se charge et reste noire, ses scripts cherchés
  // à /assets/. Le relatif marche aux deux endroits (docs/TESTING.md, 2.6).
  base: "./",
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
