import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LifeLog } from "@/components/lifelog/LifeLog";

export const metadata = { title: "Life Log — The Third Eye" };

export default async function LifeLogPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <span className="hud-label text-[#34D399]">// Life log</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Your day, recorded</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Record the day → transcript, timeline &amp; audio · open any day on the calendar · keep a diary
        </p>
      </div>
      <LifeLog />
    </div>
  );
}
