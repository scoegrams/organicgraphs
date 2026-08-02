import { z } from "zod";

// ---------------------------------------------------------------------------
// The configurable meta-model.
//
// One core platform expresses every industry. A "recommendation" is a complete,
// validated description of a tenant's operating model. Each item carries an
// `explanation` so the review UI can justify every element, and counts are
// always derived from the arrays below — never hard-coded.
// ---------------------------------------------------------------------------

export const SENSITIVITY = ["GENERAL", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const;
export const SensitivitySchema = z.enum(SENSITIVITY);
export type Sensitivity = z.infer<typeof SensitivitySchema>;

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "number",
  "currency",
  "percentage",
  "boolean",
  "date",
  "datetime",
  "status",
  "single_select",
  "multi_select",
  "email",
  "url",
  "relationship",
  "file",
] as const;
export const FieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export const CARDINALITIES = [
  "one_to_one",
  "one_to_many",
  "many_to_one",
  "many_to_many",
] as const;
export const CardinalitySchema = z.enum(CARDINALITIES);
export type Cardinality = z.infer<typeof CardinalitySchema>;

// A machine key: lowercase, snake/kebab, stable. Used for cross-references.
const KeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "keys must be lower_snake_case starting with a letter");

export const ExplanationSchema = z.object({
  why: z.string().min(1),
  businessQuestion: z.string().min(1),
  causedBy: z.string().min(1), // which wizard answer / pack rule triggered it
  origin: z.enum(["pack", "ai"]),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

export const FieldDefinitionSchema = z.object({
  key: KeySchema,
  name: z.string().min(1).max(120),
  type: FieldTypeSchema,
  description: z.string().max(500).optional(),
  required: z.boolean().default(false),
  sensitivity: SensitivitySchema.default("GENERAL"),
  // For status / *_select fields.
  options: z.array(z.string().min(1)).optional(),
  // For relationship fields — the relationship type key it renders.
  relationshipKey: z.string().optional(),
});
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;

export const RecordTypeSchema = z.object({
  key: KeySchema,
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  icon: z.string().max(40).optional(),
  color: z.string().max(24).optional(),
  sensitivity: SensitivitySchema.default("GENERAL"),
  archivable: z.boolean().default(true),
  markdownTemplate: z.string().optional(),
  fields: z.array(FieldDefinitionSchema).default([]),
  explanation: ExplanationSchema,
});
export type RecordType = z.infer<typeof RecordTypeSchema>;

export const RelationshipTypeSchema = z.object({
  key: KeySchema,
  sourceTypeKey: KeySchema,
  targetTypeKey: KeySchema,
  forwardLabel: z.string().min(1).max(80),
  reverseLabel: z.string().min(1).max(80),
  cardinality: CardinalitySchema.default("many_to_many"),
  required: z.boolean().default(false),
  sensitivity: SensitivitySchema.default("GENERAL"),
  supportsValidity: z.boolean().default(false),
  explanation: ExplanationSchema,
});
export type RelationshipType = z.infer<typeof RelationshipTypeSchema>;

export const PermissionGroupSchema = z.object({
  key: KeySchema,
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  capabilities: z.object({
    canManageSchema: z.boolean().default(false),
    canEditRecords: z.boolean().default(false),
    canApprove: z.boolean().default(false),
    canManageMembers: z.boolean().default(false),
    // Maximum sensitivity this group may read.
    maxReadSensitivity: SensitivitySchema.default("GENERAL"),
  }),
  isDefault: z.boolean().default(false),
  explanation: ExplanationSchema,
});
export type PermissionGroup = z.infer<typeof PermissionGroupSchema>;

export const WorkflowStateSchema = z.object({
  key: KeySchema,
  name: z.string().min(1).max(80),
  isTerminal: z.boolean().default(false),
});
export const WorkflowTransitionSchema = z.object({
  from: KeySchema,
  to: KeySchema,
  requiresApproval: z.boolean().default(false),
  requiredFields: z.array(z.string()).default([]),
});
export const WorkflowSchema = z.object({
  key: KeySchema,
  name: z.string().min(1).max(120),
  recordTypeKey: KeySchema,
  states: z.array(WorkflowStateSchema).min(2),
  transitions: z.array(WorkflowTransitionSchema).min(1),
  explanation: ExplanationSchema,
});
export type Workflow = z.infer<typeof WorkflowSchema>;

export const WIDGET_KINDS = [
  "count_by_type",
  "count_by_status",
  "upcoming_deadlines",
  "unowned_work",
  "blocked_work",
  "recently_changed",
  "unreviewed_ai",
  "graph_health",
  "workflow_distribution",
  "recent_audit",
] as const;
export const DashboardWidgetSchema = z.object({
  kind: z.enum(WIDGET_KINDS),
  title: z.string().min(1).max(120),
  // Optional binding, e.g. which record type or status field the widget reads.
  params: z.record(z.string(), z.unknown()).default({}),
});
export const DashboardSchema = z.object({
  key: KeySchema,
  name: z.string().min(1).max(120),
  widgets: z.array(DashboardWidgetSchema).min(1),
  explanation: ExplanationSchema,
});
export type Dashboard = z.infer<typeof DashboardSchema>;

export const HEALTH_CHECK_KINDS = [
  "active_without_owner",
  "overdue_deadline",
  "stale_review",
  "missing_required_relationship",
  "relationship_to_archived",
  "restricted_without_policy",
  "workflow_blocked",
  "unreviewed_import",
  "contract_expiring",
  "duplicate_candidate",
] as const;
export const HealthCheckSchema = z.object({
  key: KeySchema,
  name: z.string().min(1).max(120),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
  rule: z.object({
    kind: z.enum(HEALTH_CHECK_KINDS),
    params: z.record(z.string(), z.unknown()).default({}),
  }),
  explanation: ExplanationSchema,
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;

export const ImportMappingSchema = z.object({
  key: KeySchema,
  label: z.string().min(1),
  targetRecordTypeKey: KeySchema,
  // sourceColumn -> field key
  columns: z.record(z.string(), z.string()).default({}),
});
export type ImportMapping = z.infer<typeof ImportMappingSchema>;

export const SuggestedQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

export const SchemaRecommendationSchema = z
  .object({
    packKey: z.string(),
    packVersion: z.string(),
    recordTypes: z.array(RecordTypeSchema).min(1),
    relationshipTypes: z.array(RelationshipTypeSchema).default([]),
    permissionGroups: z.array(PermissionGroupSchema).min(1),
    workflows: z.array(WorkflowSchema).default([]),
    dashboards: z.array(DashboardSchema).default([]),
    healthChecks: z.array(HealthCheckSchema).default([]),
    suggestedQuestions: z.array(SuggestedQuestionSchema).default([]),
    importMappings: z.array(ImportMappingSchema).default([]),
  })
  .superRefine((rec, ctx) => {
    const typeKeys = new Set<string>();
    for (const rt of rec.recordTypes) {
      if (typeKeys.has(rt.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate record type key: ${rt.key}`,
          path: ["recordTypes"],
        });
      }
      typeKeys.add(rt.key);
    }
    const relKeys = new Set<string>();
    for (const rel of rec.relationshipTypes) {
      if (relKeys.has(rel.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate relationship key: ${rel.key}`,
          path: ["relationshipTypes"],
        });
      }
      relKeys.add(rel.key);
      if (!typeKeys.has(rel.sourceTypeKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Relationship ${rel.key} references unknown source type ${rel.sourceTypeKey}`,
          path: ["relationshipTypes"],
        });
      }
      if (!typeKeys.has(rel.targetTypeKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Relationship ${rel.key} references unknown target type ${rel.targetTypeKey}`,
          path: ["relationshipTypes"],
        });
      }
    }
    for (const wf of rec.workflows) {
      if (!typeKeys.has(wf.recordTypeKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Workflow ${wf.key} references unknown record type ${wf.recordTypeKey}`,
          path: ["workflows"],
        });
      }
    }
    // At least one permission group must be the default.
    if (!rec.permissionGroups.some((g) => g.isDefault)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one permission group must be marked default.",
        path: ["permissionGroups"],
      });
    }
  });

export type SchemaRecommendation = z.infer<typeof SchemaRecommendationSchema>;

// Input aliases (defaulted fields optional) for authoring packs ergonomically.
export type FieldDefinitionInput = z.input<typeof FieldDefinitionSchema>;
export type RecordTypeInput = z.input<typeof RecordTypeSchema>;
export type RelationshipTypeInput = z.input<typeof RelationshipTypeSchema>;
export type WorkflowInput = z.input<typeof WorkflowSchema>;
export type DashboardInput = z.input<typeof DashboardSchema>;
export type HealthCheckInput = z.input<typeof HealthCheckSchema>;
export type PermissionGroupInput = z.input<typeof PermissionGroupSchema>;
export type ImportMappingInput = z.input<typeof ImportMappingSchema>;
export type SchemaRecommendationInput = z.input<typeof SchemaRecommendationSchema>;
export type SuggestedQuestion = z.infer<typeof SuggestedQuestionSchema>;

export interface RecommendationCounts {
  recordTypes: number;
  relationshipTypes: number;
  permissionGroups: number;
  workflows: number;
  dashboards: number;
  healthChecks: number;
  suggestedQuestions: number;
  importMappings: number;
}

/** Counts derived from the recommendation payload. Never hard-coded. */
export function computeCounts(rec: SchemaRecommendation): RecommendationCounts {
  return {
    recordTypes: rec.recordTypes.length,
    relationshipTypes: rec.relationshipTypes.length,
    permissionGroups: rec.permissionGroups.length,
    workflows: rec.workflows.length,
    dashboards: rec.dashboards.length,
    healthChecks: rec.healthChecks.length,
    suggestedQuestions: rec.suggestedQuestions.length,
    importMappings: rec.importMappings.length,
  };
}

/** Human summary sentence, computed from actual counts. */
export function summarizeCounts(c: RecommendationCounts): string {
  const parts = [
    plural(c.recordTypes, "record type"),
    plural(c.relationshipTypes, "relationship"),
    plural(c.permissionGroups, "permission group"),
    plural(c.workflows, "workflow"),
    plural(c.dashboards, "dashboard"),
    plural(c.healthChecks, "automated check"),
  ];
  return `Your recommended operating model includes ${listJoin(parts)}.`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/** Validate an unknown payload (e.g. from AI). Returns typed result. */
export function parseRecommendation(input: unknown) {
  return SchemaRecommendationSchema.safeParse(input);
}
