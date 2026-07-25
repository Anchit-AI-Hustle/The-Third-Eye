import { redirect } from "next/navigation";

// Live Capture is now part of the unified Task Tracker (one combined feature:
// mic + Gmail/Chat ingestion feed the same queue). Old links land there.
export default function CapturePage() {
  redirect("/tasks");
}
