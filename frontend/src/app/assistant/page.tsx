import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AssistantClient } from "@/components/assistant/AssistantClient";

export const metadata = { title: "Assistant — The Third Eye" };

export default async function AssistantPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="h-[100dvh] flex flex-col">
      <div className="flex items-center gap-3 px-4 sm:px-8 py-4 border-b border-border-default flex-none bg-background-surface/80 backdrop-blur-sm">
        <div className="relative">
          <div className="w-2 h-2 rounded-full bg-success" />
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-success animate-ping opacity-60" />
        </div>
        <h1 className="font-display font-semibold text-text-primary tracking-tight">The Third Eye</h1>
        <span className="text-text-muted text-xs font-mono">AI Assistant · Online</span>
        <div className="ml-auto">
          <span className="text-[10px] font-mono text-text-muted bg-background-elevated border border-border-default px-2 py-1 rounded">
            gemini-2.5-flash
          </span>
        </div>
      </div>
      <AssistantClient userName={session.user?.name?.split(" ")[0]} />
    </div>
  );
}
