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
  { key: "supplier_provides_dish", sourceTypeKey: "supplier", targetTypeKey: "dish", forwardLabel: "supplies", reverseLabel: "is supplied by" },
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
 * Derived supplier→dish edges. Only when a shared ingredient path exists:
 *   Supplier → Ingredient ← Dish
 * Deduplicated by (supplierId, dishId). Never invents suppliers.
 */
export function deriveSupplierProvidesDish(edges: GraphEdge[]): GraphEdge[] {
  // ingredientId → supplierIds
  const suppliersByIngredient = new Map<string, Set<string>>();
  // ingredientId → dishIds
  const dishesByIngredient = new Map<string, Set<string>>();

  for (const e of edges) {
    if (e.relationshipTypeKey === "supplier_provides_ingredient") {
      let set = suppliersByIngredient.get(e.targetId);
      if (!set) {
        set = new Set();
        suppliersByIngredient.set(e.targetId, set);
      }
      set.add(e.sourceId);
    }
    if (e.relationshipTypeKey === "dish_uses_ingredient") {
      let set = dishesByIngredient.get(e.targetId);
      if (!set) {
        set = new Set();
        dishesByIngredient.set(e.targetId, set);
      }
      set.add(e.sourceId);
    }
  }

  const seen = new Set<string>();
  const out: GraphEdge[] = [];
  for (const [ingredientId, suppliers] of suppliersByIngredient) {
    const dishes = dishesByIngredient.get(ingredientId);
    if (!dishes) continue;
    for (const supplierId of suppliers) {
      for (const dishId of dishes) {
        const sig = `${supplierId}|${dishId}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push({
          relationshipTypeKey: "supplier_provides_dish",
          sourceId: supplierId,
          targetId: dishId,
        });
      }
    }
  }
  return out;
}

/**
 * After removing an authoritative edge, return which derived supplier→dish
 * edges are no longer supported by any remaining ingredient path.
 */
export function unsupportedSupplierDishEdges(
  remainingAuthoritative: GraphEdge[],
  existingDerived: GraphEdge[],
): GraphEdge[] {
  const stillSupported = new Set(
    deriveSupplierProvidesDish(remainingAuthoritative).map(
      (e) => `${e.sourceId}|${e.targetId}`,
    ),
  );
  return existingDerived.filter(
    (e) =>
      e.relationshipTypeKey === "supplier_provides_dish" &&
      !stillSupported.has(`${e.sourceId}|${e.targetId}`),
  );
}

/** Operational vendors must never be classified as food suppliers. */
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
  return relationshipTypeKey === "dish_paired_with";
}
