import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jarvis.app",
  appName: "JARVIS OS",
  webDir: "www",
  server: {
    url: process.env.CAP_SERVER_URL || "https://third-eye.anchit-tandon.com",
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
