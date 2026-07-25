import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { MainLayout } from "@/components/layout/MainLayout";
import { JOB_AGENT } from "@/lib/jobAgent/config";

export default async function JobAgentLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");
  if (!JOB_AGENT.enabled) {
    return (
      <MainLayout>
        <div className="p-8 max-w-xl">
          <h1 className="font-display text-2xl font-semibold text-text-primary mb-2">Job Agent</h1>
          <p className="text-text-muted text-sm">
            The Job Agent is currently disabled. Set <code className="font-mono text-text-secondary">JOB_AGENT_ENABLED=true</code> to turn it on.
          </p>
        </div>
      </MainLayout>
    );
  }
  return <MainLayout>{children}</MainLayout>;
}
