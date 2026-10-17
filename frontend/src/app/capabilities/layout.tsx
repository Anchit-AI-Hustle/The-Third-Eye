import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Capabilities - The Third Eye",
  description: "Everything JARVIS can do: voice, tasks, knowledge, studio, automations and more.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
