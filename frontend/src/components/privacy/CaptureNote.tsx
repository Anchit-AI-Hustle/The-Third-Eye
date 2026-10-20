import Link from "next/link";
import { cn } from "@/lib/utils";

// The one-line "what happens to this" next to an upload, camera or mic control.
// Each `id` is a section on /privacy.
export function CaptureNote({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] leading-snug text-text-muted", className)}>
      {children}{" "}
      <Link href={`/privacy#${id}`} className="underline hover:text-text-secondary">
        Privacy
      </Link>
    </p>
  );
}
