"use client";

import { Card3D } from "@/components/hud/Card3D";
import { HoloFrame } from "@/components/hud/HoloFrame";

export type Feature = {
  title: string;
  body: string;
  tag: string;
};

// Feature cards on the shared 3D system: each panel tilts toward the pointer
// and its title/tag ride forward on separate depth planes, so the card reads
// as a physical object rather than a rectangle with a hover colour.
export function FeatureGrid({ features }: { features: Feature[] }) {
  return (
    <div className="scene-3d grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {features.map((f) => (
        <Card3D key={f.title} data-reveal className="h-full">
          <HoloFrame
            size="sm"
            className="h-full rounded-card border border-border-default bg-background-surface p-5 text-left transition-colors hover:border-accent-blue/30"
          >
            <span className="hud-label depth-1 block">{f.tag}</span>

            <h3 className="depth-2 mb-2 mt-2 font-medium text-text-primary">{f.title}</h3>

            <p className="depth-1 text-sm leading-relaxed text-text-secondary">{f.body}</p>
          </HoloFrame>
        </Card3D>
      ))}
    </div>
  );
}
