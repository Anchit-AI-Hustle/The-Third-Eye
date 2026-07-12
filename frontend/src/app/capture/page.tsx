import { CaptureClient } from "@/components/capture/CaptureClient";

export const metadata = { title: "Live Capture — The Third Eye" };

export default function CapturePage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 pb-28 max-w-5xl">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="hud-label text-[#4FC3F7]">// Ambient Capture</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-text-primary">Live Capture</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">
          Listen in real time · auto-extract tasks, reminders &amp; ideas · organised by conversation type
        </p>
      </div>
      <CaptureClient />
    </div>
  );
}
