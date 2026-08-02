import {
  SchemaRecommendationSchema,
  type SchemaRecommendation,
  type SchemaRecommendationInput,
  type SuggestedQuestion,
} from "@/lib/meta-model";
import type { WizardAnswers } from "@/lib/wizard";
import type { IndustryPackDef } from "./types";
import {
  baseDashboards,
  baseHealthChecks,
  basePermissionGroups,
  baseQuestions,
  regulatorAddon,
  workflowFromStages,
} from "./common";

/**
 * Assemble a full, validated SchemaRecommendation from an industry pack and the
 * wizard answers. Answer-driven additions (regulators, deadline dashboards and
 * checks, a workflow built from the user's own stages, sensitivity policies)
 * mean the counts genuinely reflect the interview — nothing is hard-coded.
 */
export function assembleRecommendation(
  pack: IndustryPackDef,
  answers: WizardAnswers,
): SchemaRecommendation {
  const recordTypes = [...pack.recordTypes];
  const relationshipTypes = [...pack.relationshipTypes];
  const workflows = [...pack.workflows];

  // Regulators → add a regulator type + oversight relationship.
  if (
    answers.participants.groups.includes("regulators") &&
    !recordTypes.some((rt) => rt.key === "regulator")
  ) {
    const addon = regulatorAddon(pack.primaryUnitTypeKey);
    recordTypes.push(addon.recordType);
    relationshipTypes.push(addon.relationship);
  }

  // A workflow built from the stages the user described.
  const custom = workflowFromStages(
    pack.primaryUnitTypeKey,
    answers.valueAndWork.stages,
  );
  if (custom && !workflows.some((w) => w.key === custom.key)) {
    workflows.push(custom);
  }

  const hasContracts = recordTypes.some((rt) =>
    /contract|agreement/.test(rt.key),
  );
  const hasWorkflows = workflows.length > 0;

  const permissionGroups = basePermissionGroups(answers);
  const dashboards = baseDashboards(answers);
  const healthChecks = baseHealthChecks(answers, { hasContracts, hasWorkflows });

  const questions = dedupeQuestions([...baseQuestions(), ...pack.questions]);

  const draft: SchemaRecommendationInput = {
    packKey: pack.key,
    packVersion: pack.version,
    recordTypes,
    relationshipTypes,
    permissionGroups,
    workflows,
    dashboards,
    healthChecks,
    suggestedQuestions: questions,
    importMappings: pack.importMappings,
  };

  // Validate (fills defaults, rejects duplicate ids / dangling references).
  return SchemaRecommendationSchema.parse(draft);
}

function dedupeQuestions(qs: SuggestedQuestion[]): SuggestedQuestion[] {
  const seen = new Set<string>();
  const out: SuggestedQuestion[] = [];
  for (const q of qs) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    out.push(q);
  }
  return out;
}
