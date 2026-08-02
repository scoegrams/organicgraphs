import type {
  Dashboard,
  Explanation,
  FieldDefinition,
  FieldDefinitionInput,
  HealthCheck,
  PermissionGroup,
  RecordType,
  RecordTypeInput,
  RelationshipType,
  SuggestedQuestion,
  Workflow,
} from "@/lib/meta-model";
import type { WizardAnswers } from "@/lib/wizard";

// Shorthand explanation builder.
export function expl(
  why: string,
  businessQuestion: string,
  causedBy: string,
  origin: Explanation["origin"] = "pack",
): Explanation {
  return { why, businessQuestion, causedBy, origin };
}

// Common field snippets reused across record types.
export const commonFields = {
  status(options: string[]): FieldDefinition {
    return {
      key: "status",
      name: "Status",
      type: "status",
      required: false,
      sensitivity: "GENERAL",
      options,
    };
  },
  notes(): FieldDefinition {
    return {
      key: "notes",
      name: "Notes",
      type: "long_text",
      required: false,
      sensitivity: "INTERNAL",
    };
  },
  dueDate(): FieldDefinition {
    return { key: "due_date", name: "Due date", type: "date", required: false, sensitivity: "GENERAL" };
  },
  email(): FieldDefinition {
    return { key: "email", name: "Email", type: "email", required: false, sensitivity: "INTERNAL" };
  },
  amount(name = "Amount"): FieldDefinition {
    return { key: "amount", name, type: "currency", required: false, sensitivity: "CONFIDENTIAL" };
  },
};

/**
 * Standard permission groups. Adjusts read ceilings and approval defaults from
 * the security answers so the output reflects the interview.
 */
export function basePermissionGroups(answers: WizardAnswers): PermissionGroup[] {
  const regulated =
    answers.security.regulatedData ||
    Boolean(answers.security.confidentialInfo?.trim());
  return [
    {
      key: "org_admin",
      name: "Organization administrator",
      description: "Full control of schema, members, and records.",
      isDefault: false,
      capabilities: {
        canManageSchema: true,
        canEditRecords: true,
        canApprove: true,
        canManageMembers: true,
        maxReadSensitivity: "RESTRICTED",
      },
      explanation: expl(
        "Every workspace needs an owner who can evolve the model and manage access.",
        "Who can change the operating model and who can see everything?",
        "Baseline governance for any organization.",
      ),
    },
    {
      key: "manager",
      name: "Manager",
      description: "Approves work and reads confidential data, cannot change schema.",
      isDefault: false,
      capabilities: {
        canManageSchema: false,
        canEditRecords: true,
        canApprove: true,
        canManageMembers: false,
        maxReadSensitivity: regulated ? "CONFIDENTIAL" : "CONFIDENTIAL",
      },
      explanation: expl(
        "Managers approve stage transitions and review sensitive records without administering the platform.",
        "Who signs off on work and can view confidential context?",
        "Approval and oversight needs identified in the interview.",
      ),
    },
    {
      key: "contributor",
      name: "Contributor",
      description: "Creates and edits everyday records; limited sensitive access.",
      isDefault: true,
      capabilities: {
        canManageSchema: false,
        canEditRecords: true,
        canApprove: false,
        canManageMembers: false,
        maxReadSensitivity: "INTERNAL",
      },
      explanation: expl(
        "Most team members do the day-to-day work and should not see restricted data by default.",
        "Who does the work, and what should they not see?",
        "Default role so new members start with least privilege.",
      ),
    },
    {
      key: "viewer",
      name: "Viewer",
      description: "Read-only access to general information.",
      isDefault: false,
      capabilities: {
        canManageSchema: false,
        canEditRecords: false,
        canApprove: false,
        canManageMembers: false,
        maxReadSensitivity: "GENERAL",
      },
      explanation: expl(
        "Stakeholders and external reviewers need visibility without edit rights.",
        "Who needs to see progress but not change anything?",
        "Common read-only stakeholder need.",
      ),
    },
  ];
}

/** Standard dashboards, with answer-driven additions. */
export function baseDashboards(answers: WizardAnswers): Dashboard[] {
  const dashboards: Dashboard[] = [
    {
      key: "overview",
      name: "Overview",
      widgets: [
        { kind: "count_by_type", title: "Records by type", params: {} },
        { kind: "count_by_status", title: "Work by status", params: {} },
        { kind: "recently_changed", title: "Recently changed", params: {} },
      ],
      explanation: expl(
        "A landing view that orients anyone to the shape and momentum of the organization.",
        "What exists and what changed recently?",
        "Every workspace needs an at-a-glance home.",
      ),
    },
    {
      key: "ownership_and_health",
      name: "Ownership & health",
      widgets: [
        { kind: "unowned_work", title: "Work without an owner", params: {} },
        { kind: "blocked_work", title: "Blocked work", params: {} },
        { kind: "graph_health", title: "Graph-health issues", params: {} },
      ],
      explanation: expl(
        "Surfaces accountability gaps and stuck work so nothing falls through the cracks.",
        "What has no owner, and what is stuck?",
        "Blockers and ownership were flagged as risks in the interview.",
      ),
    },
    {
      key: "governance_audit",
      name: "Governance & audit",
      widgets: [
        { kind: "unreviewed_ai", title: "Unreviewed AI suggestions", params: {} },
        { kind: "recent_audit", title: "Recent activity", params: {} },
      ],
      explanation: expl(
        "Keeps AI-created facts and important mutations reviewable and traceable.",
        "What did AI propose, and who changed what?",
        "Provenance and auditability are core product principles.",
      ),
    },
  ];

  if (answers.valueAndWork.deadlinesMatter) {
    dashboards.push({
      key: "deadlines",
      name: "Deadlines",
      widgets: [
        { kind: "upcoming_deadlines", title: "Upcoming deadlines", params: {} },
      ],
      explanation: expl(
        "You told us deadlines matter, so time-sensitive work gets its own focused view.",
        "What is due soon and might slip?",
        "Wizard answer: deadlines matter to this organization.",
      ),
    });
  }
  return dashboards;
}

/** Standard health checks, with answer-driven additions. */
export function baseHealthChecks(
  answers: WizardAnswers,
  ctx: { hasContracts: boolean; hasWorkflows: boolean },
): HealthCheck[] {
  const checks: HealthCheck[] = [
    {
      key: "active_without_owner",
      name: "Active work has no owner",
      severity: "warning",
      rule: { kind: "active_without_owner", params: {} },
      explanation: expl(
        "Unowned active work is the most common source of dropped commitments.",
        "Which active items have nobody responsible?",
        "Ownership gaps flagged as a risk.",
      ),
    },
    {
      key: "stale_review",
      name: "Record not reviewed recently",
      severity: "info",
      rule: { kind: "stale_review", params: { days: 90 } },
      explanation: expl(
        "Facts drift; periodic review keeps the graph trustworthy.",
        "What information may be out of date?",
        "Data freshness is a governance need.",
      ),
    },
    {
      key: "unreviewed_import",
      name: "Imported fact still unreviewed",
      severity: "info",
      rule: { kind: "unreviewed_import", params: {} },
      explanation: expl(
        "AI- and import-derived facts must be confirmed before they are trusted.",
        "What was ingested but not yet verified?",
        "Provenance principle: AI facts retain review status.",
      ),
    },
    {
      key: "duplicate_candidate",
      name: "Possible duplicate records",
      severity: "info",
      rule: { kind: "duplicate_candidate", params: {} },
      explanation: expl(
        "Duplicates fracture the graph and mislead reports.",
        "Are we tracking the same thing twice?",
        "Import and manual entry create duplicates over time.",
      ),
    },
  ];

  if (answers.valueAndWork.deadlinesMatter) {
    checks.push({
      key: "overdue_deadline",
      name: "Deadline is overdue",
      severity: "critical",
      rule: { kind: "overdue_deadline", params: {} },
      explanation: expl(
        "Overdue commitments need immediate attention.",
        "What is already late?",
        "Wizard answer: deadlines matter.",
      ),
    });
  }
  if (
    answers.security.regulatedData ||
    Boolean(answers.security.confidentialInfo?.trim())
  ) {
    checks.push({
      key: "restricted_without_policy",
      name: "Restricted record lacks an access policy",
      severity: "critical",
      rule: { kind: "restricted_without_policy", params: {} },
      explanation: expl(
        "Sensitive records must not be reachable simply because they are connected.",
        "Is any restricted data exposed without an explicit policy?",
        "Wizard answer: confidential or regulated information is involved.",
      ),
    });
  }
  if (ctx.hasContracts) {
    checks.push({
      key: "contract_expiring",
      name: "Contract approaching expiration",
      severity: "warning",
      rule: { kind: "contract_expiring", params: { days: 45 } },
      explanation: expl(
        "Lapsed agreements create legal and revenue risk.",
        "Which agreements need renewal soon?",
        "This industry tracks contracts.",
      ),
    });
  }
  if (ctx.hasWorkflows) {
    checks.push({
      key: "workflow_blocked",
      name: "Workflow item is blocked",
      severity: "warning",
      rule: { kind: "workflow_blocked", params: {} },
      explanation: expl(
        "Items stuck between states stall delivery.",
        "What is blocked in a process right now?",
        "This organization runs staged workflows.",
      ),
    });
  }
  return checks;
}

export function baseQuestions(): SuggestedQuestion[] {
  return [
    { id: "who_owns", text: "Who owns this project?" },
    { id: "client_projects", text: "What projects belong to this client?" },
    { id: "no_owner", text: "Which records have no owner?" },
    { id: "deadlines", text: "What deadlines are approaching?" },
    { id: "blocked", text: "Which projects are blocked?" },
    { id: "unreviewed", text: "What records have not been reviewed recently?" },
  ];
}

/** A regulator record type + relationship, added when regulators participate. */
export function regulatorAddon(primaryTypeKey: string): {
  recordType: RecordType;
  relationship: RelationshipType;
} {
  return {
    recordType: {
      key: "regulator",
      name: "Regulator",
      description: "An external body that oversees or audits the organization.",
      icon: "landmark",
      color: "#b45309",
      sensitivity: "INTERNAL",
      archivable: true,
      fields: [
        { key: "jurisdiction", name: "Jurisdiction", type: "short_text", required: false, sensitivity: "GENERAL" },
        commonFields.notes(),
      ],
      explanation: expl(
        "You indicated regulators interact with the company, so compliance relationships are first-class.",
        "Who oversees us and what are we accountable for?",
        "Wizard answer: regulators are participants.",
      ),
    },
    relationship: {
      key: "regulator_oversees",
      sourceTypeKey: "regulator",
      targetTypeKey: primaryTypeKey,
      forwardLabel: "oversees",
      reverseLabel: "is overseen by",
      cardinality: "many_to_many",
      required: false,
      sensitivity: "INTERNAL",
      supportsValidity: true,
      explanation: expl(
        "Ties regulatory oversight to the work it governs.",
        "Which work is subject to which regulator?",
        "Wizard answer: regulators are participants.",
      ),
    },
  };
}

/** Build a workflow from user-provided stages on the primary work unit. */
export function workflowFromStages(
  primaryTypeKey: string,
  stages: string[],
): Workflow | null {
  const clean = stages.map((s) => s.trim()).filter(Boolean);
  if (clean.length < 2) return null;
  const states = clean.map((label, i) => ({
    key: slugKey(label, i),
    name: label,
    isTerminal: i === clean.length - 1,
  }));
  const transitions = states.slice(0, -1).map((s, i) => ({
    from: s.key,
    to: states[i + 1]!.key,
    requiresApproval: false,
    requiredFields: [] as string[],
  }));
  return {
    key: "custom_stage_flow",
    name: "Your work stages",
    recordTypeKey: primaryTypeKey,
    states,
    transitions,
    explanation: expl(
      "Built directly from the stages you described your work passing through.",
      "Where is each unit of work in your own process?",
      "Wizard answer: the stages you listed under value & work.",
      "pack",
    ),
  };
}

/** Compact record-type builder used across the specialized packs. */
export function rt(
  key: string,
  name: string,
  description: string,
  opts: {
    icon?: string;
    color?: string;
    sensitivity?: "GENERAL" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
    fields?: FieldDefinitionInput[];
    why: string;
    question: string;
    cause: string;
  },
): RecordTypeInput {
  return {
    key,
    name,
    description,
    icon: opts.icon,
    color: opts.color,
    sensitivity: opts.sensitivity ?? "GENERAL",
    archivable: true,
    fields: opts.fields ?? [],
    explanation: expl(opts.why, opts.question, opts.cause),
  };
}

/** Compact relationship builder used across packs. */
export function rel(
  key: string,
  sourceTypeKey: string,
  targetTypeKey: string,
  forwardLabel: string,
  reverseLabel: string,
  cardinality:
    | "one_to_one"
    | "one_to_many"
    | "many_to_one"
    | "many_to_many" = "many_to_many",
  sensitivity: "GENERAL" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" = "GENERAL",
): RelationshipType {
  return {
    key,
    sourceTypeKey,
    targetTypeKey,
    forwardLabel,
    reverseLabel,
    cardinality,
    required: false,
    supportsValidity: false,
    sensitivity,
    explanation: expl(
      `Captures how ${sourceTypeKey.replace(/_/g, " ")} relates to ${targetTypeKey.replace(/_/g, " ")}.`,
      `How is ${sourceTypeKey.replace(/_/g, " ")} connected to ${targetTypeKey.replace(/_/g, " ")}?`,
      "Core relationship for this operating model.",
    ),
  };
}

export function slugKey(input: string, fallbackIndex = 0): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const safe = /^[a-z]/.test(base) ? base : `stage_${base}`;
  return safe || `stage_${fallbackIndex}`;
}
