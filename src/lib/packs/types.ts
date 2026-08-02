import type {
  ImportMappingInput,
  RecordTypeInput,
  RelationshipTypeInput,
  SuggestedQuestion,
  WorkflowInput,
} from "@/lib/meta-model";

export interface IndustryPackDef {
  key: string;
  version: string;
  name: string;
  description: string;
  /** Prominent safety warning shown in the UI (e.g. PCI / PHI). */
  warning?: string;
  /** The record type key representing the org's primary unit of work. */
  primaryUnitTypeKey: string;
  recordTypes: RecordTypeInput[];
  relationshipTypes: RelationshipTypeInput[];
  workflows: WorkflowInput[];
  questions: SuggestedQuestion[];
  importMappings: ImportMappingInput[];
}

export interface IndustryPackMeta {
  key: string;
  version: string;
  name: string;
  description: string;
  warning?: string;
}

export function packMeta(p: IndustryPackDef): IndustryPackMeta {
  return {
    key: p.key,
    version: p.version,
    name: p.name,
    description: p.description,
    warning: p.warning,
  };
}
