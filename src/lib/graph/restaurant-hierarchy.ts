/**
 * Restaurant graph invariants — presentation ranks, reverse traversal for
 * operational drill-down, and derived supplier→dish edges.
 *
 * Visual hierarchy must never invent or reverse stored relationship directions.
 * See docs/hospitality.md.
 */

/** Presentation-only ranks for the restaurant pack. Never persisted as edges. */
export const RESTAURANT_VISUAL_RANK: Record<string, number> = {
  location: 0,
  team: 1,
  menu: 1,
  staff: 2,
  event: 1,
  vendor: 1,
  dish: 3,
  ingredient: 4,
  supplier: 5,
};

export function restaurantVisualRank(typeKey: string): number | undefined {
  return RESTAURANT_VISUAL_RANK[typeKey];
}

/** Canonical relationship directions for the restaurant pack. */
export const RESTAURANT_CANONICAL_RELS: ReadonlyArray<{
  key: string;
  sourceTypeKey: string;
  targetTypeKey: string;
  forwardLabel: string;
  reverseLabel: string;
}> = [
  { key: "chef_owns_dish", sourceTypeKey: "staff", targetTypeKey: "dish", forwardLabel: "owns", reverseLabel: "is owned by" },
  { key: "staff_in_team", sourceTypeKey: "staff", targetTypeKey: "team", forwardLabel: "part of", reverseLabel: "includes" },
  { key: "team_at_location", sourceTypeKey: "team", targetTypeKey: "location", forwardLabel: "based at", reverseLabel: "employs team" },
  { key: "dish_uses_ingredient", sourceTypeKey: "dish", targetTypeKey: "ingredient", forwardLabel: "uses", reverseLabel: "is used in" },
  { key: "supplier_provides_ingredient", sourceTypeKey: "supplier", targetTypeKey: "ingredient", forwardLabel: "provides", reverseLabel: "is provided by" },
  { key: "dish_on_menu", sourceTypeKey: "dish", targetTypeKey: "menu", forwardLabel: "appears on", reverseLabel: "features" },
  { key: "menu_at_location", sourceTypeKey: "menu", targetTypeKey: "location", forwardLabel: "served at", reverseLabel: "serves" },
  { key: "staff_works_at", sourceTypeKey: "staff", targetTypeKey: "location", forwardLabel: "works at", reverseLabel: "employs" },
  { key: "event_at_location", sourceTypeKey: "event", targetTypeKey: "location", forwardLabel: "held at", reverseLabel: "hosts" },
  { key: "location_uses_vendor", sourceTypeKey: "location", targetTypeKey: "vendor", forwardLabel: "uses", reverseLabel: "is used by" },
  { key: "vendor_integrates_with", sourceTypeKey: "vendor", targetTypeKey: "vendor", forwardLabel: "integrates with", reverseLabel: "integrates with" },
  { key: "supplier_provides_dish", sourceTypeKey: "supplier", targetTypeKey: "dish", forwardLabel: "supplies", reverseLabel: "is supplied by" },
  { key: "supplier_for_menu", sourceTypeKey: "supplier", targetTypeKey: "menu", forwardLabel: "supplies ingredients for", reverseLabel: "sourced from" },
  { key: "dish_paired_with", sourceTypeKey: "dish", targetTypeKey: "dish", forwardLabel: "is paired with", reverseLabel: "is paired with" },
];

export type GraphEdge = {
  relationshipTypeKey: string;
  sourceId: string;
  targetId: string;
};

export type GraphNode = {
  id: string;
  typeKey: string;
};

/**
 * Operational drill-down: Location → Menu → Dish.
 * Uses reverse traversal of stored edges (dish→menu, menu→location).
 * Does not fabricate or reverse persisted edges.
 */
export function dishesAtLocation(
  locationId: string,
  edges: GraphEdge[],
): string[] {
  const menuIds = edges
    .filter(
      (e) =>
        e.relationshipTypeKey === "menu_at_location" &&
        e.targetId === locationId,
    )
    .map((e) => e.sourceId);

  const dishIds = new Set<string>();
  for (const menuId of menuIds) {
    for (const e of edges) {
      if (e.relationshipTypeKey === "dish_on_menu" && e.targetId === menuId) {
        dishIds.add(e.sourceId);
      }
    }
  }
  return [...dishIds];
}

/**
 * Supplier→dish and supplier→menu shortcuts used to be derived here. They are
 * now declared as path rules in `graph/inference/rules.ts` and applied by the
 * shared engine, which also retracts them when their ingredient path is gone.
 */

const OPERATIONAL_VENDOR_CATEGORIES = new Set([
  "pos",
  "reservations",
  "delivery",
  "linen & laundry",
  "linen",
  "waste",
  "payroll",
  "accounting",
  "marketing",
  "comms",
  "maintenance",
]);

export function isOperationalVendorCategory(category: string | undefined): boolean {
  if (!category) return false;
  return OPERATIONAL_VENDOR_CATEGORIES.has(category.trim().toLowerCase());
}

/** Self-edges are only allowed for explicitly self-referential types. */
export function allowsSelfRelationship(relationshipTypeKey: string): boolean {
  return (
    relationshipTypeKey === "dish_paired_with" ||
    relationshipTypeKey === "vendor_integrates_with"
  );
}
