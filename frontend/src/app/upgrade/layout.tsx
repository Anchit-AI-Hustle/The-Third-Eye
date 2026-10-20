import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Upgrade - The Third Eye",
  description: "Compare plans and unlock more of JARVIS: higher limits, every studio tool and AI personas.",
  path: "/upgrade",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
