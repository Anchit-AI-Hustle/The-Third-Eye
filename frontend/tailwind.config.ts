import type { Config } from "tailwindcss";

// Canonical palette. `globals.css :root` mirrors these exact values as
// `--color-*` custom properties so the Tailwind layer and the CSS-variable
// layer can never drift apart again — change a colour here and there.
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
          secondary: "#B0B8C8",
          muted:     "#6B7394",
        },
        accent: {
          blue:   "#4FC3F7",   // Arc Blue — primary brand
          violet: "#7B5CF0",
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
      transitionTimingFunction: {
        jarvis: "cubic-bezier(0, 0, 0.2, 1)",
        // Depth moves settle rather than stop dead — used by the 3D primitives.
        depth:  "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      transitionDuration: { interaction: "150ms", page: "250ms", depth: "420ms" },
      boxShadow: {
        card:     "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(79,195,247,0.04)",
        elevated: "0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(79,195,247,0.06)",
        cyan:     "0 0 20px rgba(79,195,247,0.15), 0 0 60px rgba(79,195,247,0.05)",
        // Lift used when a Card3D is under the pointer.
        lift:     "0 24px 60px -20px rgba(0,0,0,0.85), 0 0 40px rgba(79,195,247,0.10)",
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
