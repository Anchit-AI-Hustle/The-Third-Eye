import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SettingsHub } from "@/components/settings/SettingsHub";

export const metadata = { title: "Settings — The Third Eye" };

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  return (
    <div className="p-4 sm:p-6 lg:p-8 pb-28 lg:pb-28 max-w-2xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="hud-label text-[#4FC3F7]">// System Configuration</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">Manage your account, agent, and how you wake it</p>
      </div>
      <SettingsHub user={session?.user ?? null} />
    </div>
  );
}
