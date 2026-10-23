import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Readiness audit - The Third Eye",
  description: "Check which JARVIS features are ready on this device and account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
