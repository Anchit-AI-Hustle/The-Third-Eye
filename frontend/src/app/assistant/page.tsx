import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AssistantClient } from "@/components/assistant/AssistantClient";

export const metadata = { title: "Assistant — The Third Eye" };

export default async function AssistantPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 min-w-0 px-3 sm:px-8 py-3 border-b border-border-default flex-none bg-background-surface/80 backdrop-blur-sm">
        <div className="relative flex-none">
          <div className="w-2 h-2 rounded-full bg-success" />
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-success animate-ping opacity-60" />
        </div>
        <h1 className="font-display font-semibold text-text-primary tracking-tight truncate">The Third Eye</h1>
        <span className="hidden sm:inline text-text-muted text-xs font-mono truncate">AI Assistant · Online</span>
        <div className="ml-auto flex-none">
          <span className="text-[10px] font-mono text-text-muted bg-background-elevated border border-border-default px-2 py-1 rounded">
            gemini-2.5-flash
          </span>
        </div>
      </div>
      <AssistantClient userName={session.user?.name?.split(" ")[0]} />
    </div>
  );
}
