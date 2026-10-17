import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upgrade - The Third Eye",
  description: "Compare plans and unlock more of JARVIS: higher limits, every studio tool and AI personas.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
