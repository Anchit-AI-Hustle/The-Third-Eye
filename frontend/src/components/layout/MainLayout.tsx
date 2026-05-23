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
          "flex-1 overflow-y-auto pb-16 lg:pb-0"
        }
      >
        {children}
      </main>
      <BottomNav />
      <VoiceOverlay />
    </div>
  );
}
