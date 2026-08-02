import type { WizardAnswers } from "@/lib/wizard";
import type { SchemaRecommendation } from "@/lib/meta-model";

// Versioned prompts. Bump the version when the wording changes so behavior is
// traceable and testable. The deterministic recommendation is passed as a seed
// so the model refines a valid structure rather than inventing the shape.
export const RECOMMEND_SCHEMA_PROMPT_VERSION = "recommend_schema.v1";

export function buildRecommendSchemaMessages(args: {
  answers: WizardAnswers;
  seed: SchemaRecommendation;
  packKey: string;
  packVersion: string;
}) {
  const system = [
    "You are an organizational-modeling assistant for OrgGraph.",
    "You output ONLY strict JSON matching the provided seed's structure exactly.",
    "Every array item MUST include an `explanation` object with keys: why, businessQuestion, causedBy, origin.",
    "Set origin to \"ai\" for items you add or substantially change, otherwise keep \"pack\".",
    "Never invent commercial claims (prices, customers, benchmarks). Keep keys lower_snake_case and unique.",
    "Preserve packKey and packVersion. Do not remove required permission group defaults.",
  ].join(" ");

  const user = [
    `packKey=${args.packKey} packVersion=${args.packVersion}`,
    "Wizard answers (JSON):",
    JSON.stringify(args.answers),
    "Deterministic seed recommendation to refine (JSON):",
    JSON.stringify(args.seed),
    "Return a single JSON object with the same top-level keys as the seed: packKey, packVersion, recordTypes, relationshipTypes, permissionGroups, workflows, dashboards, healthChecks, suggestedQuestions, importMappings.",
    "Tailor names, descriptions, and add high-value items justified by the answers. Keep everything internally consistent (relationships must reference existing record type keys).",
  ].join("\n\n");

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}
