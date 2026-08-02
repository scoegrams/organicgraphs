import "server-only";
import { getIntelligenceProvider } from "@/lib/ai";
import {
  computeCounts,
  type RecommendationCounts,
  type SchemaRecommendation,
} from "@/lib/meta-model";
import type { WizardAnswers } from "@/lib/wizard";

export interface GeneratedRecommendation {
  payload: SchemaRecommendation;
  counts: RecommendationCounts;
  source: string;
}

/**
 * Produce a recommendation for a pack + answers using the active provider.
 * Counts are always computed from the returned payload.
 */
export async function generateRecommendation(
  packKey: string,
  answers: WizardAnswers,
): Promise<GeneratedRecommendation> {
  const provider = getIntelligenceProvider();
  const payload = await provider.recommendSchema({ packKey, answers });
  return {
    payload,
    counts: computeCounts(payload),
    source: provider.name,
  };
}
