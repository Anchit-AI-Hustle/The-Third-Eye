import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const metadata = { title: "Dashboard — The Third Eye" };

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8 3xl:px-12 3xl:py-10 max-w-7xl 3xl:max-w-screen-2xl mx-auto">
      <div className="mb-6 md:mb-8">
        <h1 className="font-display text-2xl md:text-3xl 3xl:text-4xl font-bold tracking-tight">
          <span className="text-text-muted text-lg font-mono font-normal">//</span>{" "}
          Good {getDayPeriod()},{" "}
          <span className="gradient-text-arc">
            {session?.user?.name?.split(" ")[0] ?? "Commander"}
          </span>
        </h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          {new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          }).format(new Date())}
          {" · "}ALL SYSTEMS OPERATIONAL
        </p>
      </div>
      <DashboardClient />
    </div>
  );
}

function getDayPeriod() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
