import OpenAI from "openai";
import { parseRecommendation, type SchemaRecommendation } from "@/lib/meta-model";
import { requirePack } from "@/lib/packs";
import { assembleRecommendation } from "@/lib/packs/assemble";
import { DeterministicProvider } from "./deterministic-provider";
import {
  buildRecommendSchemaMessages,
} from "./prompts";
import type {
  CitedAnswer,
  ChangeRequest,
  ImportClassificationRequest,
  ImportSuggestion,
  OrganizationIntelligenceProvider,
  OrganizationQuestion,
  ProposedChangeSet,
  RecommendSchemaInput,
} from "./types";

// OpenAI-backed provider. Uses structured JSON output, validates strictly with
// Zod, and falls back to the deterministic result on ANY failure (no key,
// network error, invalid types, duplicate ids, dangling references). The key is
// only ever read server-side.
export class OpenAIProvider implements OrganizationIntelligenceProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model: string;
  private fallback = new DeterministicProvider();

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async recommendSchema(
    input: RecommendSchemaInput,
  ): Promise<SchemaRecommendation> {
    const pack = requirePack(input.packKey);
    const seed = assembleRecommendation(pack, input.answers);
    try {
      const messages = buildRecommendSchemaMessages({
        answers: input.answers,
        seed,
        packKey: pack.key,
        packVersion: pack.version,
      });
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.2,
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) return seed;
      const parsed = parseRecommendation(JSON.parse(content));
      if (!parsed.success) {
        console.warn(
          "[ai] OpenAI recommendation failed validation; using deterministic seed.",
          parsed.error.issues.slice(0, 3),
        );
        return seed;
      }
      return parsed.data;
    } catch (err) {
      console.warn(
        "[ai] OpenAI recommendation error; using deterministic seed:",
        (err as Error).message,
      );
      return seed;
    }
  }

  proposeChanges(input: ChangeRequest): Promise<ProposedChangeSet> {
    return this.fallback.proposeChanges(input);
  }
  answerQuestion(input: OrganizationQuestion): Promise<CitedAnswer> {
    return this.fallback.answerQuestion(input);
  }
  classifyImport(
    input: ImportClassificationRequest,
  ): Promise<ImportSuggestion> {
    return this.fallback.classifyImport(input);
  }
}
