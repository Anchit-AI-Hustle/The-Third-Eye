"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTool } from "@/lib/studioTools";
import { StudioWorkbench } from "@/components/studio/StudioWorkbench";
import { MusicStudio } from "@/components/studio/MusicStudio";
import { HealthStudio } from "@/components/health/HealthStudio";

export default function StudioToolPage() {
  const params = useParams();
  const id = Array.isArray(params.tool) ? params.tool[0] : params.tool;
  const tool = id ? getTool(id) : undefined;

  if (!tool) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Link href="/tools" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary">
          <ArrowLeft size={12} /> Studio
        </Link>
        <p className="text-text-muted mt-6">Unknown tool.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Link href="/tools" className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-primary mb-4">
        <ArrowLeft size={12} /> Studio
      </Link>
      <div className="mb-5">
        <span className="hud-label" style={{ color: tool.accent }}>// {tool.mode} mode</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary mt-1">{tool.label}</h1>
        <p className="text-text-muted text-xs font-mono mt-1 tracking-wider">{tool.blurb}</p>
      </div>
      {tool.id === "music" ? <MusicStudio /> : tool.id === "health" ? <HealthStudio /> : <StudioWorkbench tool={tool} />}
    </div>
  );
}
