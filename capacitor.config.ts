import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.jarvis.app",
  appName: "JARVIS OS",
  // Points to the live Vercel deployment — no static export needed
  server: {
    url: "https://jarvis-anchit.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#0A0A0F",
  },
  android: {
    backgroundColor: "#0A0A0F",
    allowMixedContent: false,
  },
};

export default config;
