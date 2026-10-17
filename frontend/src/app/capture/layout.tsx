import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MainLayout } from "@/components/layout/MainLayout";

export const metadata = {
  title: "Live capture - The Third Eye",
  description: "Capture tasks and notes from what you say, hands-free.",
};

export default async function CaptureLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");
  return <MainLayout>{children}</MainLayout>;
}
