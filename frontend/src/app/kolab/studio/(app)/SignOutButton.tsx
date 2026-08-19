"use client";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/kolab-studio/auth";
import { Button } from "@/components/kolab-studio/ui";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      className="px-3 py-2.5"
      onClick={async () => {
        await signOut();
        router.push("/kolab/studio/auth");
        router.refresh();
      }}
    >
      Exit Kolab
    </Button>
  );
}
