// web/lib/copy/index.ts
// Per-pack copy dictionaries (spec §3 vocabulary rule): no hardcoded audience words in
// components. A restaurant never sees "cart"; a creator never sees "SKU". Components read
// strings via getCopy(pack). Extend CopyDict as packs grow — every pack must define every key.
import { creatorCopy } from "./creator";
import { commerceCopy } from "./commerce";
import { localCopy } from "./local";
import { agencyCopy } from "./agency";
import type { PackType } from "../packs";

export interface CopyDict {
  packLabel: string;
  homeEyebrow: string;
  homeTitle: string;
  homeSubtitle: string;
  /** The audience noun this pack uses (followers / customers / guests / clients). */
  audienceWord: string;
  audienceWordPlural: string;
  /** What a "contact" is called in this pack. */
  contactWord: string;
  /** Empty-state line for the pack dashboard. */
  emptyDashboard: string;
  /** Primary revenue/outcome metric label. */
  primaryMetric: string;
}

const DICTS: Record<PackType, CopyDict> = {
  creator: creatorCopy,
  commerce: commerceCopy,
  local: localCopy,
  agency: agencyCopy,
};

export function getCopy(pack: PackType): CopyDict {
  return DICTS[pack];
}
