import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { MainLayout } from "@/components/layout/MainLayout";

export default async function KolabLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");
  return <MainLayout mainClassName="flex-1 overflow-hidden">{children}</MainLayout>;
}
