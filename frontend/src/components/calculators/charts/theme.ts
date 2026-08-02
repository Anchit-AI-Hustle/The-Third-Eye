// Chart palette — mirrors the tailwind design tokens (tailwind.config.ts) so the
// SVG charts sit in the same dark cyan "JARVIS" system as the rest of the app.
export const CHART = {
  blue: "#00D4FF",
  violet: "#7C5CEF",
  muted: "#6B7394",
  secondary: "#B0B8C8",
  border: "#0F2235",
  surface: "#0D1B30",
  success: "#10B981",
  warning: "#F59E0B",
  red: "#EF4444",
} as const;

export const DONUT_COLORS = [CHART.blue, CHART.violet, CHART.muted, CHART.success, CHART.warning];
