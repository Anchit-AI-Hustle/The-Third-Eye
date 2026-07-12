import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { VoiceOverlay } from "../voice/VoiceOverlay";

interface MainLayoutProps {
  children: React.ReactNode;
  mainClassName?: string;
}

export function MainLayout({ children, mainClassName }: MainLayoutProps) {
  return (
    <div className="flex h-screen bg-background-base overflow-hidden">
      <Sidebar />
      <main
        className={
          mainClassName ??
          "flex-1 overflow-y-auto pb-[calc(4rem_+_env(safe-area-inset-bottom))] lg:pb-0"
        }
      >
        {children}
      </main>
      <BottomNav />
      <VoiceOverlay />
    </div>
  );
}
