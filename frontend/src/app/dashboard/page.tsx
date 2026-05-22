import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const metadata = { title: "Dashboard — JARVIS OS" };

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-text-primary">
          Good{getDayPeriod()},{" "}
          <span className="text-accent-blue">
            {session?.user?.name?.split(" ")[0] ?? "Commander"}
          </span>
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          }).format(new Date())}
        </p>
      </div>

      <DashboardClient />
    </div>
  );
}

function getDayPeriod() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
