import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TasksClient } from "@/components/tasks/TasksClient";

export const metadata = { title: "Tasks — JARVIS OS" };

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/signin");

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text-primary">Tasks</h1>
        <p className="text-text-secondary text-sm mt-1">
          Manage your work. Stored locally — ask JARVIS to help prioritize.
        </p>
      </div>
      <TasksClient />
    </div>
  );
}
