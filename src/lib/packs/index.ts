import type { IndustryPackDef, IndustryPackMeta } from "./types";
import { packMeta } from "./types";
import { genericPack } from "./generic";
import { publishingPack } from "./publishing";
import { constructionPack } from "./construction";
import { paymentsPack } from "./payments";
import { softwarePack } from "./software";

export const PACKS: IndustryPackDef[] = [
  genericPack,
  publishingPack,
  constructionPack,
  paymentsPack,
  softwarePack,
];

const byKey = new Map(PACKS.map((p) => [p.key, p]));

export function getPack(key: string): IndustryPackDef | undefined {
  return byKey.get(key);
}

export function requirePack(key: string): IndustryPackDef {
  const p = byKey.get(key);
  if (!p) throw new Error(`Unknown industry pack: ${key}`);
  return p;
}

export function listPackMeta(): IndustryPackMeta[] {
  return PACKS.map(packMeta);
}

export type { IndustryPackDef, IndustryPackMeta };
export { packMeta };
