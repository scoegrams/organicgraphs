import "server-only";
import { z } from "zod";
import OpenAI from "openai";
import { describeActiveProvider } from "@/lib/ai";
import {
  expandNodeSuggestions,
  parseRepoSuggestions,
  toProposalSet,
  type ExistingNode,
  type GraphSchema,
  type NodeSuggestion,
  type ProposalSet,
} from "./proposals";

export interface FillInput {
  kind: "expand" | "repo";
  anchor: ExistingNode;
  schema: GraphSchema;
  /** Existing record display names by type, so the model reuses instead of duplicating. */
  existingByType: Record<string, string[]>;
  repoText?: string;
}

const ModelNode = z.object({
  recordTypeKey: z.string(),
  displayName: z.string().min(1),
  relationshipTypeKey: z.string(),
  direction: z.enum(["outgoing", "incoming"]),
  values: z.record(z.unknown()).optional(),
  rationale: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
const ModelOut = z.object({
  summary: z.string().optional(),
  nodes: z.array(ModelNode).max(24),
});

/**
 * Produce a review-ready proposal set. Always computes a deterministic baseline;
 * when an AI provider is enabled it tries the model and, on ANY failure, keeps
 * the deterministic result. Never throws to the caller.
 */
export async function generateProposals(input: FillInput): Promise<ProposalSet> {
  const deterministic =
    input.kind === "expand"
      ? expandNodeSuggestions(input.anchor, input.schema)
      : parseRepoSuggestions(input.repoText ?? "", input.anchor, input.schema);

  const baseSummary =
    input.kind === "expand"
      ? `Typical connections for ${input.anchor.name}`
      : `Extracted from repository input`;

  const { aiEnabled } = describeActiveProvider();
  if (!aiEnabled) {
    return toProposalSet(
      input.anchor,
      deterministic,
      input.schema,
      "deterministic",
      baseSummary,
    );
  }

  try {
    const model = await callModel(input);
    if (model && model.length > 0) {
      return toProposalSet(
        input.anchor,
        model,
        input.schema,
        "openai",
        input.kind === "expand"
          ? `AI suggestions for ${input.anchor.name}`
          : `AI extracted from repository input`,
      );
    }
  } catch {
    // fall through to deterministic
  }
  return toProposalSet(
    input.anchor,
    deterministic,
    input.schema,
    "deterministic",
    baseSummary,
  );
}

async function callModel(input: FillInput): Promise<NodeSuggestion[] | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const client = new OpenAI({ apiKey: key });
  const modelName = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  const schemaBlock = input.schema.relationshipTypes
    .map(
      (r) =>
        `- ${r.key}: ${typeName(input.schema, r.sourceTypeKey)} ${r.forwardLabel} ${typeName(input.schema, r.targetTypeKey)}`,
    )
    .join("\n");
  const typeBlock = input.schema.types.map((t) => `- ${t.key} (${t.name})`).join("\n");
  const existingBlock = Object.entries(input.existingByType)
    .map(([k, names]) => `- ${k}: ${names.slice(0, 40).join(", ")}`)
    .join("\n");

  const task =
    input.kind === "expand"
      ? `Suggest records that most likely connect to the anchor node below. Use ONLY the relationship types listed. "direction" is relative to the NEW node ("outgoing" = new node is the source).`
      : `Extract concrete records (features, services, providers) from the repository input below and connect them to the anchor product. Use ONLY the listed relationship types.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You extend a company knowledge graph. Reuse existing records by exact name when appropriate rather than inventing near-duplicates. Return strict JSON only.",
    },
    {
      role: "user",
      content: `${task}

ANCHOR: ${input.anchor.name} (type: ${input.anchor.typeKey})

RECORD TYPES:
${typeBlock}

RELATIONSHIP TYPES (key: source label target):
${schemaBlock}

EXISTING RECORDS (do not duplicate these names):
${existingBlock || "(none)"}
${input.kind === "repo" ? `\nREPOSITORY INPUT:\n${(input.repoText ?? "").slice(0, 6000)}` : ""}

Respond as JSON: {"summary": string, "nodes": [{"recordTypeKey": string, "displayName": string, "relationshipTypeKey": string, "direction": "outgoing"|"incoming", "values": object?, "rationale": string?, "confidence": number?}]}`,
    },
  ];

  const completion = await client.chat.completions.create({
    model: modelName,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) return null;
  const parsed = ModelOut.safeParse(JSON.parse(content));
  if (!parsed.success) return null;
  return parsed.data.nodes.map((n) => ({
    recordTypeKey: n.recordTypeKey,
    displayName: n.displayName,
    relationshipTypeKey: n.relationshipTypeKey,
    direction: n.direction,
    values: n.values,
    rationale: n.rationale,
    confidence: n.confidence ?? 0.5,
  }));
}

function typeName(schema: GraphSchema, key: string): string {
  return schema.types.find((t) => t.key === key)?.name ?? key;
}
