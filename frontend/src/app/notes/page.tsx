import { NotesClient } from "@/components/notes/NotesClient";

export const metadata = { title: "Intel Notes — The Third Eye" };

export default function NotesPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="hud-label text-[#4FC3F7]">// Intel Archive</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Notes</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">Quick capture · Ask your AI to &quot;take a note about X&quot;</p>
      </div>
      <NotesClient />
    </div>
  );
}
