import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TasksClient } from "@/components/tasks/TasksClient";

export const metadata = { title: "Action Tracker — The Third Eye" };

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="hud-label text-[#4FC3F7]">// Mission Queue</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Action Tracker</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">Manage and prioritise all active tasks</p>
      </div>
      <TasksClient />
    </div>
  );
}
