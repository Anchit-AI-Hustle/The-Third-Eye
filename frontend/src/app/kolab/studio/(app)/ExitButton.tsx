"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/kolab-studio/ui";

// Kolab Studio shares the app's sign-in, so leaving it is navigation, not a sign-out.
export function ExitButton() {
  const router = useRouter();
  return (
    <Button className="px-3 py-2.5" onClick={() => router.push("/kolab")}>
      Exit Kolab
    </Button>
  );
}
