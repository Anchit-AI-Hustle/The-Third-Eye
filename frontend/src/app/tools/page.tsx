import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StudioHub } from "@/components/studio/StudioHub";

export const metadata = { title: "Studio — The Third Eye" };

export default async function ToolsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="hud-label text-[#4FC3F7]">// Studio</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Studio</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Tools for your current mode — switch modes to see the Startup, Office or Hobby studio
        </p>
      </div>
      <StudioHub />
    </div>
  );
}
