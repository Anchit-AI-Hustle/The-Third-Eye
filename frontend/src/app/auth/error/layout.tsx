import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign-in problem - The Third Eye",
  description: "Something stopped the sign-in. See what happened and try again.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
