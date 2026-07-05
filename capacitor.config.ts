import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jarvis.app",
  appName: "JARVIS OS",
  // CLI requires a webDir even when loading a remote URL; www/ holds a splash
  // fallback shown before the live app loads.
  webDir: "www",
  // Points to the live Vercel deployment — no static export needed.
  server: {
    url: "https://jarvis-anchit.vercel.app",
    cleartext: false,
  },
  backgroundColor: "#0A0A0F",
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0A0A0F",
  },
  android: {
    backgroundColor: "#0A0A0F",
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0A0A0F",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0A0A0F",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
