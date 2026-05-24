import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { KnowledgeClient } from "@/components/knowledge/KnowledgeClient";

export const metadata = { title: "Knowledge Base — The Third Eye" };

export default async function KnowledgePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="hud-label text-[#4FC3F7]">// Knowledge Core</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Knowledge Base</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">Upload documents · Ask questions with citations</p>
      </div>
      <KnowledgeClient />
    </div>
  );
}
