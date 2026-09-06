import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ch.moods.app",
  appName: "Moods",
  webDir: "dist",
  server: {
    // Le Pi est en HTTP sur le réseau local : autoriser le contenu non-HTTPS.
    androidScheme: "http",
    cleartext: true,
  },
  ios: { contentInset: "always" },
};

export default config;
