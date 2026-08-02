import type { SchemaRecommendation } from "@/lib/meta-model";
import type { WizardAnswers } from "@/lib/wizard";

// ---------------------------------------------------------------------------
// The single AI seam for the whole product. Every intelligent capability goes
// through this interface so providers are swappable and testable. A
// deterministic local provider implements it fully; the OpenAI provider adds
// model-backed generation with strict Zod validation and deterministic
// fallback. API keys never reach the browser — providers run server-side only.
// ---------------------------------------------------------------------------

export interface RecommendSchemaInput {
  packKey: string;
  answers: WizardAnswers;
}

export interface ChangeRequest {
  organizationId: string;
  text: string;
  // Read-side context the provider may use (never includes fields the current
  // user cannot read — that filtering happens before calling the provider).
  context?: unknown;
}

export interface ProposedOperation {
  kind:
    | "create_record"
    | "update_record"
    | "create_relationship"
    | "remove_relationship";
  description: string;
  payload: Record<string, unknown>;
  confidence: number;
}

export interface ProposedChangeSet {
  operations: ProposedOperation[];
  ambiguities: string[];
  warnings: string[];
  confidence: number;
  sourceText: string;
}

export interface OrganizationQuestion {
  organizationId: string;
  question: string;
  context?: unknown;
}

export interface Citation {
  recordId?: string;
  label: string;
  detail?: string;
}

export interface CitedAnswer {
  answer: string;
  citations: Citation[];
  confidence: number;
  isInference: boolean;
}

export interface ImportClassificationRequest {
  headers: string[];
  sampleRows: Record<string, string>[];
  candidateRecordTypeKeys: string[];
}

export interface ImportSuggestion {
  targetRecordTypeKey: string;
  columnMapping: Record<string, string>;
  confidence: number;
}

export interface OrganizationIntelligenceProvider {
  readonly name: string;
  recommendSchema(input: RecommendSchemaInput): Promise<SchemaRecommendation>;
  proposeChanges(input: ChangeRequest): Promise<ProposedChangeSet>;
  answerQuestion(input: OrganizationQuestion): Promise<CitedAnswer>;
  classifyImport(
    input: ImportClassificationRequest,
  ): Promise<ImportSuggestion>;
}
