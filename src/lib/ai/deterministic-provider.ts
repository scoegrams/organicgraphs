import { assembleRecommendation } from "@/lib/packs/assemble";
import { requirePack } from "@/lib/packs";
import type {
  CitedAnswer,
  ImportClassificationRequest,
  ImportSuggestion,
  OrganizationIntelligenceProvider,
  OrganizationQuestion,
  ProposedChangeSet,
  ChangeRequest,
  RecommendSchemaInput,
} from "./types";
import type { SchemaRecommendation } from "@/lib/meta-model";

// The deterministic provider is the always-available baseline. It produces a
// complete, valid recommendation from the industry pack + wizard answers with
// no network call, and provides deterministic implementations of the other
// capabilities so the product works fully without any AI key.
export class DeterministicProvider implements OrganizationIntelligenceProvider {
  readonly name = "deterministic";

  async recommendSchema(
    input: RecommendSchemaInput,
  ): Promise<SchemaRecommendation> {
    const pack = requirePack(input.packKey);
    return assembleRecommendation(pack, input.answers);
  }

  async proposeChanges(input: ChangeRequest): Promise<ProposedChangeSet> {
    // A real deterministic parser lands in a later milestone. For now return an
    // empty, honest change set rather than fabricating operations.
    return {
      operations: [],
      ambiguities: [
        "The deterministic parser for free-text change requests is not yet enabled.",
      ],
      warnings: [],
      confidence: 0,
      sourceText: input.text,
    };
  }

  async answerQuestion(_input: OrganizationQuestion): Promise<CitedAnswer> {
    return {
      answer:
        "Graph-aware question answering is implemented against stored records in a later milestone.",
      citations: [],
      confidence: 0,
      isInference: true,
    };
  }

  async classifyImport(
    input: ImportClassificationRequest,
  ): Promise<ImportSuggestion> {
    const target = input.candidateRecordTypeKeys[0] ?? "person";
    const columnMapping: Record<string, string> = {};
    for (const h of input.headers) {
      const key = h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      columnMapping[h] = /name|title/.test(key) ? "displayName" : key;
    }
    return { targetRecordTypeKey: target, columnMapping, confidence: 0.4 };
  }
}
