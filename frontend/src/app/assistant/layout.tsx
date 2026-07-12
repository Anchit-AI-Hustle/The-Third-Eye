import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { MainLayout } from "@/components/layout/MainLayout";

export default async function AssistantLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");
  return (
    <MainLayout mainClassName="flex-1 overflow-hidden flex flex-col pb-[calc(4rem_+_env(safe-area-inset-bottom))] lg:pb-0">
      {children}
    </MainLayout>
  );
}
