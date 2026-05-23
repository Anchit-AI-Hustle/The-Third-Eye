import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TasksClient } from "@/components/tasks/TasksClient";

export const metadata = { title: "Action Tracker — JARVIS OS" };

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-text-primary">Team Action Tracker</h1>
      </div>
      <TasksClient />
    </div>
  );
}
