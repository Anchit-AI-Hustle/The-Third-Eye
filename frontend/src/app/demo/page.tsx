import { redirect } from "next/navigation";

// The demo was retired for the real app; links already shared still land somewhere useful.
export default function DemoPage() {
  redirect("/auth/signin");
}
