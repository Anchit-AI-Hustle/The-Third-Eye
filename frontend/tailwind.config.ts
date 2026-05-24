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
      screens: { "3xl": "1920px" },
      colors: {
        background: {
          base:     "#050505",
          surface:  "#07111F",
          elevated: "#0D1B30",
        },
        border: {
          default: "#0F2235",
          hover:   "#1A3A5C",
        },
        text: {
          primary:   "#FFFFFF",
          secondary: "#A0AEC0",
          muted:     "#4A6080",
        },
        accent: {
          blue:   "#00D4FF",   // Electric Cyan — primary brand
          violet: "#7C5CEF",
          red:    "#EF4444",
        },
        success: "#10B981",
        warning: "#F59E0B",
      },
      fontFamily: {
        sans:    ["Inter", "system-ui", "sans-serif"],
        display: ["Geist", "Inter", "system-ui", "sans-serif"],
        mono:    ["Geist Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        base: ["14px", { lineHeight: "1.6" }],
      },
      borderRadius: {
        card:  "8px",
        input: "6px",
        badge: "3px",
      },
      transitionTimingFunction: { jarvis: "cubic-bezier(0, 0, 0.2, 1)" },
      transitionDuration: { interaction: "150ms", page: "250ms" },
      boxShadow: {
        card:     "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,212,255,0.04)",
        elevated: "0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.06)",
        cyan:     "0 0 20px rgba(0,212,255,0.15), 0 0 60px rgba(0,212,255,0.05)",
      },
      backdropBlur: { modal: "16px" },
      animation: {
        "fade-in":  "fadeIn 200ms ease-out",
        "slide-in": "slideIn 150ms ease-out",
        "slide-up": "slideUp 200ms ease-out",
      },
      keyframes: {
        fadeIn:  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideIn: { "0%": { opacity: "0", transform: "translateY(4px)" },  "100%": { opacity: "1", transform: "translateY(0)" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(8px)" },  "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};

export default config;
