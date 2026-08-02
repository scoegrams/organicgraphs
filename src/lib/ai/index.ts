import "server-only";
import { DeterministicProvider } from "./deterministic-provider";
import { OpenAIProvider } from "./openai-provider";
import type { OrganizationIntelligenceProvider } from "./types";

// Factory: pick a provider from environment. Defaults to deterministic. The
// OpenAI provider is only used when explicitly enabled AND a key is present;
// it still falls back to deterministic per-call on any failure.
export function getIntelligenceProvider(): OrganizationIntelligenceProvider {
  const mode = process.env.AI_PROVIDER?.toLowerCase();
  const key = process.env.OPENAI_API_KEY?.trim();
  if (mode === "openai" && key) {
    const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
    return new OpenAIProvider(key, model);
  }
  return new DeterministicProvider();
}

export function describeActiveProvider(): { name: string; aiEnabled: boolean } {
  const mode = process.env.AI_PROVIDER?.toLowerCase();
  const key = process.env.OPENAI_API_KEY?.trim();
  const aiEnabled = mode === "openai" && Boolean(key);
  return { name: aiEnabled ? "openai" : "deterministic", aiEnabled };
}

export type { OrganizationIntelligenceProvider } from "./types";
