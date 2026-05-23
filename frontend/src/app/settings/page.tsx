import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SettingsClient } from "@/components/settings/SettingsClient";

export const metadata = { title: "Settings — JARVIS OS" };

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  return (
    <div className="p-4 sm:p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-text-secondary text-sm mt-1">Manage your account and preferences.</p>
      </div>
      <SettingsClient user={session?.user ?? null} />
    </div>
  );
}
