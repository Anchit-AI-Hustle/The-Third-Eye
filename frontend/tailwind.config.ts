import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // JARVIS OS Design System — Dark-first palette
        background: {
          base: "#0A0A0F",
          surface: "#111118",
          elevated: "#1A1A24",
        },
        border: {
          default: "#1E1E2E",
          hover: "#2A2A3E",
        },
        text: {
          primary: "#F0F0FF",
          secondary: "#8888AA",
          muted: "#4A4A6A",
        },
        accent: {
          blue: "#5B8DEF",
          violet: "#7C5CEF",
          red: "#EF5B8D",
        },
        success: "#4EEF8D",
        warning: "#EFC94E",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Geist", "Inter", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        base: ["14px", { lineHeight: "1.6" }],
      },
      borderRadius: {
        card: "6px",
        input: "4px",
        badge: "2px",
      },
      transitionTimingFunction: {
        jarvis: "cubic-bezier(0, 0, 0.2, 1)",
      },
      transitionDuration: {
        interaction: "150ms",
        page: "300ms",
      },
      boxShadow: {
        // Offset-based only — no blur-heavy shadows
        card: "2px 4px 0px rgba(0,0,0,0.4)",
        elevated: "4px 8px 0px rgba(0,0,0,0.5)",
      },
      backdropBlur: {
        modal: "12px",
      },
      animation: {
        "fade-in": "fadeIn 150ms ease-out",
        "slide-in": "slideIn 150ms ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    screens: {
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
      "3xl": "1920px",
    },
  },
  plugins: [],
};

export default config;
