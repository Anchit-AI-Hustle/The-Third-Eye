import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jarvis.app",
  appName: "JARVIS OS",
  webDir: "www",
  server: {
    // Must match a domain actually attached to the Vercel project. This read
    // "third-eye.anchit-tandon.com" — missing the leading "the-" — which is not
    // one of the project's domains, so the native shell loaded a host that does
    // not resolve. Everything else (frontend/src/lib/site.ts, the docs, the
    // registered Google OAuth origin) uses the spelling below.
    url: process.env.CAP_SERVER_URL || "https://the-third-eye.anchit-tandon.com",
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
