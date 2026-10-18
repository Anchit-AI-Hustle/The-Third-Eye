import { HeroCanvas } from "@/components/landing/HeroCanvas";

// The landing page's 3D eye behind a full screen (welcome, sign-in), veiled so
// the copy on top stays crisp.
export function SceneBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0">
      <HeroCanvas />
      <div className="absolute inset-0 bg-gradient-to-b from-background-base/10 via-background-base/55 to-background-base" />
    </div>
  );
}
