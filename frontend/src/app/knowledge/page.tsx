import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { KnowledgeClient } from "@/components/knowledge/KnowledgeClient";

export const metadata = { title: "Knowledge — JARVIS OS" };

export default async function KnowledgePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text-primary">
          Knowledge
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Upload documents and ask questions across them with citations.
        </p>
      </div>
      <KnowledgeClient />
    </div>
  );
}
