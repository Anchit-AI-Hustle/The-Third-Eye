import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AssistantClient } from "@/components/assistant/AssistantClient";

export const metadata = { title: "Assistant — JARVIS OS" };

export default async function AssistantPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="h-screen flex flex-col">
      <div className="px-8 py-5 border-b border-border-default flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
        <h1 className="font-display font-semibold text-text-primary">JARVIS</h1>
        <span className="text-text-muted text-xs font-mono">Executive Agent · Online</span>
      </div>
      <AssistantClient />
    </div>
  );
}
