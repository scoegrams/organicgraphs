import type { GraphNode, InferenceRule } from "./engine";

/**
 * Inference rules per industry pack.
 *
 * A rule is a claim of the form "walking this path is enough evidence to state
 * this edge". Keep rules structural: they should encode facts that follow from
 * the graph, not taste. Anything a reasonable operator could disagree with
 * belongs in the AI proposal queue, not here.
 */

function fieldText(node: GraphNode, key: string): string {
  const raw = node.values?.[key];
  return typeof raw === "string" ? raw.toLowerCase() : "";
}

/** Categories where "we both run at this location" implies a real integration. */
const INTEGRATING_VENDOR_PAIRS: [string, string][] = [
  ["pos", "reservations"],
  ["pos", "delivery"],
  ["pos", "payroll"],
  ["pos", "accounting"],
  ["reservations", "marketing"],
];

function vendorsPlausiblyIntegrate(a: GraphNode, b: GraphNode): boolean {
  const ca = fieldText(a, "category");
  const cb = fieldText(b, "category");
  if (!ca || !cb || ca === cb) return false;
  return INTEGRATING_VENDOR_PAIRS.some(
    ([x, y]) => (ca === x && cb === y) || (ca === y && cb === x),
  );
}

const CODE_HOSTING_CATEGORIES = new Set(["dev tools", "hosting"]);

/**
 * Tools a person on a product plausibly touches themselves. Infrastructure a
 * product happens to run on (hosting, payments, auth) says nothing about who
 * on the team actually uses it.
 */
const PERSONAL_TOOL_CATEGORIES = new Set(["dev tools", "comms", "design", "productivity"]);

export const restaurantInferenceRules: InferenceRule[] = [
  {
    key: "supplier_dish_via_ingredient",
    infers: "supplier_provides_dish",
    sourceType: "supplier",
    targetType: "dish",
    // Supplier → Ingredient ← Dish
    path: [
      { rel: "supplier_provides_ingredient", dir: "forward" },
      { rel: "dish_uses_ingredient", dir: "reverse" },
    ],
    baseConfidence: 0.9,
    rationale: "Supplies an ingredient this dish is made from",
    retractable: true,
  },
  {
    key: "supplier_menu_via_dish",
    infers: "supplier_for_menu",
    sourceType: "supplier",
    targetType: "menu",
    // Supplier → Ingredient ← Dish → Menu
    path: [
      { rel: "supplier_provides_ingredient", dir: "forward" },
      { rel: "dish_uses_ingredient", dir: "reverse" },
      { rel: "dish_on_menu", dir: "forward" },
    ],
    maxFanOut: 12,
    baseConfidence: 0.75,
    rationale: "Supplies ingredients for dishes on this menu",
    retractable: true,
  },
  {
    key: "staff_location_via_team",
    infers: "staff_works_at",
    sourceType: "staff",
    targetType: "location",
    // Staff → Team → Location
    path: [
      { rel: "staff_in_team", dir: "forward" },
      { rel: "team_at_location", dir: "forward" },
    ],
    maxFanOut: 6,
    baseConfidence: 0.9,
    rationale: "On a team based at this location",
    retractable: true,
  },
  {
    key: "chef_location_via_dish",
    infers: "staff_works_at",
    sourceType: "staff",
    targetType: "location",
    // Staff → Dish → Menu → Location
    path: [
      { rel: "chef_owns_dish", dir: "forward" },
      { rel: "dish_on_menu", dir: "forward" },
      { rel: "menu_at_location", dir: "forward" },
    ],
    maxFanOut: 6,
    baseConfidence: 0.7,
    rationale: "Owns a dish on a menu served at this location",
    retractable: true,
  },
  {
    key: "vendor_integration_via_location",
    infers: "vendor_integrates_with",
    sourceType: "vendor",
    targetType: "vendor",
    // Vendor ← Location → Vendor, only for categories that genuinely wire together.
    path: [
      { rel: "location_uses_vendor", dir: "reverse" },
      { rel: "location_uses_vendor", dir: "forward" },
    ],
    guard: vendorsPlausiblyIntegrate,
    maxFanOut: 4,
    baseConfidence: 0.45,
    rationale: "Runs alongside this system at the same location",
    retractable: true,
  },
];

export const softwareInferenceRules: InferenceRule[] = [
  {
    key: "person_product_via_feature",
    infers: "person_member_of_product",
    sourceType: "person",
    targetType: "product",
    // Person → Feature → Product
    path: [
      { rel: "person_owns_feature", dir: "forward" },
      { rel: "feature_belongs_to_product", dir: "forward" },
    ],
    maxFanOut: 8,
    baseConfidence: 0.9,
    rationale: "Owns a feature that belongs to this product",
    retractable: true,
  },
  {
    key: "service_product_via_feature",
    infers: "service_supports_product",
    sourceType: "service",
    targetType: "product",
    // Service ← Feature → Product
    path: [
      { rel: "feature_in_service", dir: "reverse" },
      { rel: "feature_belongs_to_product", dir: "forward" },
    ],
    maxFanOut: 6,
    baseConfidence: 0.8,
    rationale: "Runs a feature that belongs to this product",
    retractable: true,
  },
  {
    key: "person_vendor_via_product",
    infers: "person_uses_vendor",
    sourceType: "person",
    targetType: "vendor",
    // Person → Product → Vendor
    path: [
      { rel: "person_member_of_product", dir: "forward" },
      { rel: "product_uses_vendor", dir: "forward" },
    ],
    guard: (_person, vendor) => PERSONAL_TOOL_CATEGORIES.has(fieldText(vendor, "category")),
    maxFanOut: 6,
    baseConfidence: 0.6,
    rationale: "Works on a product that runs on this tool",
    retractable: true,
  },
  {
    key: "person_vendor_via_service",
    infers: "person_uses_vendor",
    sourceType: "person",
    targetType: "vendor",
    // Person → Service → Vendor
    path: [
      { rel: "person_operates_service", dir: "forward" },
      { rel: "service_hosted_on_vendor", dir: "forward" },
    ],
    maxFanOut: 6,
    baseConfidence: 0.7,
    rationale: "Operates a service hosted on this provider",
    retractable: true,
  },
  {
    key: "repo_vendor_via_product",
    infers: "repository_hosted_on_vendor",
    sourceType: "repository",
    targetType: "vendor",
    // Repository ← Product → Vendor, only where the vendor can actually host code.
    path: [
      { rel: "product_has_repository", dir: "reverse" },
      { rel: "product_uses_vendor", dir: "forward" },
    ],
    guard: (_repo, vendor) => CODE_HOSTING_CATEGORIES.has(fieldText(vendor, "category")),
    maxFanOut: 3,
    baseConfidence: 0.65,
    rationale: "Belongs to a product that uses this code host",
    retractable: true,
  },
  {
    key: "service_repo_via_product",
    infers: "product_has_repository",
    sourceType: "product",
    targetType: "repository",
    // Product ← Service → Repository
    path: [
      { rel: "service_supports_product", dir: "reverse" },
      { rel: "service_in_repository", dir: "forward" },
    ],
    maxFanOut: 6,
    baseConfidence: 0.7,
    rationale: "A service supporting this product is built from this repository",
    retractable: true,
  },
];

const RULES_BY_PACK: Record<string, InferenceRule[]> = {
  restaurant: restaurantInferenceRules,
  software: softwareInferenceRules,
};

export function inferenceRulesForPack(packKey: string | null | undefined): InferenceRule[] {
  if (!packKey) return [];
  return RULES_BY_PACK[packKey] ?? [];
}

const RULE_BY_KEY = new Map(
  Object.values(RULES_BY_PACK)
    .flat()
    .map((rule) => [rule.key, rule]),
);

/** The human-readable reason a rule exists, for showing edge provenance. */
export function rationaleForRule(ruleKey: string): string | null {
  return RULE_BY_KEY.get(ruleKey)?.rationale ?? null;
}

/** Relationship types where a node may legitimately point at itself. */
export const SELF_EDGE_ALLOWED = new Set<string>();
