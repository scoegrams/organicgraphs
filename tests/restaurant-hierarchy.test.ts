import { describe, expect, it } from "vitest";
import { restaurantPack } from "@/lib/packs/restaurant";
import {
  RESTAURANT_CANONICAL_RELS,
  allowsSelfRelationship,
  deriveSupplierProvidesDish,
  dishesAtLocation,
  isOperationalVendorCategory,
  restaurantVisualRank,
  unsupportedSupplierDishEdges,
} from "@/lib/graph/restaurant-hierarchy";
import { buildRestaurantDataset } from "@/lib/demo/seed";
import { emptyAnswers, type WizardAnswers } from "@/lib/wizard";

describe("restaurant hierarchy invariants", () => {
  it("relationship source and target types match canonical directions", () => {
    for (const canon of RESTAURANT_CANONICAL_RELS) {
      const rel = restaurantPack.relationshipTypes.find((r) => r.key === canon.key);
      expect(rel, canon.key).toBeDefined();
      expect(rel!.sourceTypeKey).toBe(canon.sourceTypeKey);
      expect(rel!.targetTypeKey).toBe(canon.targetTypeKey);
    }
  });

  it("reverse labels read naturally (location_uses_vendor: uses / is used by)", () => {
    const locVendor = restaurantPack.relationshipTypes.find(
      (r) => r.key === "location_uses_vendor",
    )!;
    expect(locVendor.forwardLabel).toBe("uses");
    expect(locVendor.reverseLabel).toBe("is used by");

    for (const canon of RESTAURANT_CANONICAL_RELS) {
      const rel = restaurantPack.relationshipTypes.find((r) => r.key === canon.key)!;
      expect(rel.forwardLabel).toBe(canon.forwardLabel);
      expect(rel.reverseLabel).toBe(canon.reverseLabel);
    }
  });

  it("Location → Menu → Dish works via reverse traversal of stored edges", () => {
    // Stored: dish → menu, menu → location
    const edges = [
      { relationshipTypeKey: "menu_at_location", sourceId: "menu_dinner", targetId: "loc_dt" },
      { relationshipTypeKey: "menu_at_location", sourceId: "menu_brunch", targetId: "loc_dt" },
      { relationshipTypeKey: "dish_on_menu", sourceId: "dish_pasta", targetId: "menu_dinner" },
      { relationshipTypeKey: "dish_on_menu", sourceId: "dish_eggs", targetId: "menu_brunch" },
      { relationshipTypeKey: "dish_on_menu", sourceId: "dish_other", targetId: "menu_elsewhere" },
      { relationshipTypeKey: "menu_at_location", sourceId: "menu_elsewhere", targetId: "loc_other" },
    ];
    const dishes = dishesAtLocation("loc_dt", edges).sort();
    expect(dishes).toEqual(["dish_eggs", "dish_pasta"]);
    // Must not invent a stored Location→Menu edge — only reverse-read.
    expect(
      edges.some(
        (e) =>
          e.relationshipTypeKey === "menu_at_location" &&
          e.sourceId === "loc_dt",
      ),
    ).toBe(false);
  });

  it("supplier→dish fan-out only when a shared ingredient path exists", () => {
    const edges = [
      { relationshipTypeKey: "supplier_provides_ingredient", sourceId: "sup_farm", targetId: "ing_tomato" },
      { relationshipTypeKey: "dish_uses_ingredient", sourceId: "dish_pasta", targetId: "ing_tomato" },
      { relationshipTypeKey: "dish_uses_ingredient", sourceId: "dish_salad", targetId: "ing_tomato" },
      // No path: supplier has flour but no dish uses flour
      { relationshipTypeKey: "supplier_provides_ingredient", sourceId: "sup_mill", targetId: "ing_flour" },
      // No path: dish uses basil but no supplier
      { relationshipTypeKey: "dish_uses_ingredient", sourceId: "dish_pesto", targetId: "ing_basil" },
    ];
    const derived = deriveSupplierProvidesDish(edges);
    expect(derived).toHaveLength(2);
    expect(derived.map((e) => `${e.sourceId}->${e.targetId}`).sort()).toEqual([
      "sup_farm->dish_pasta",
      "sup_farm->dish_salad",
    ]);
  });

  it("fan-out is deduplicated across multiple shared ingredients", () => {
    const edges = [
      { relationshipTypeKey: "supplier_provides_ingredient", sourceId: "sup", targetId: "ing_a" },
      { relationshipTypeKey: "supplier_provides_ingredient", sourceId: "sup", targetId: "ing_b" },
      { relationshipTypeKey: "dish_uses_ingredient", sourceId: "dish", targetId: "ing_a" },
      { relationshipTypeKey: "dish_uses_ingredient", sourceId: "dish", targetId: "ing_b" },
    ];
    const derived = deriveSupplierProvidesDish(edges);
    expect(derived).toHaveLength(1);
    expect(derived[0]).toEqual({
      relationshipTypeKey: "supplier_provides_dish",
      sourceId: "sup",
      targetId: "dish",
    });
  });

  it("removing the last ingredient path invalidates derived supplier→dish", () => {
    const authoritative = [
      { relationshipTypeKey: "supplier_provides_ingredient", sourceId: "sup", targetId: "ing" },
      { relationshipTypeKey: "dish_uses_ingredient", sourceId: "dish", targetId: "ing" },
    ];
    const derived = deriveSupplierProvidesDish(authoritative);
    expect(derived).toHaveLength(1);

    // Drop dish_uses_ingredient — path gone
    const remaining = authoritative.filter(
      (e) => e.relationshipTypeKey !== "dish_uses_ingredient",
    );
    const stale = unsupportedSupplierDishEdges(remaining, derived);
    expect(stale).toHaveLength(1);
    expect(stale[0]!.targetId).toBe("dish");
  });

  it("vendors and suppliers remain separate types", () => {
    const keys = restaurantPack.recordTypes.map((r) => r.key);
    expect(keys).toContain("vendor");
    expect(keys).toContain("supplier");
    expect(keys.filter((k) => k === "vendor" || k === "supplier")).toHaveLength(2);

    expect(isOperationalVendorCategory("POS")).toBe(true);
    expect(isOperationalVendorCategory("Reservations")).toBe(true);
    expect(isOperationalVendorCategory("Waste")).toBe(true);
    expect(isOperationalVendorCategory("Produce")).toBe(false);
  });

  it("visual rank metadata does not persist fabricated edges", () => {
    expect(restaurantVisualRank("location")).toBe(0);
    expect(restaurantVisualRank("menu")).toBe(1);
    expect(restaurantVisualRank("dish")).toBe(2);
    expect(restaurantVisualRank("ingredient")).toBe(3);
    expect(restaurantVisualRank("supplier")).toBe(4);
    // Rank helper is pure metadata — calling it never produces edges.
    const before = restaurantPack.relationshipTypes.length;
    restaurantVisualRank("location");
    restaurantVisualRank("supplier");
    expect(restaurantPack.relationshipTypes.length).toBe(before);
  });

  it("self-relationships only allowed for dish_paired_with", () => {
    expect(allowsSelfRelationship("dish_paired_with")).toBe(true);
    expect(allowsSelfRelationship("dish_on_menu")).toBe(false);
    expect(allowsSelfRelationship("chef_owns_dish")).toBe(false);
  });

  it("seeded restaurant graph has no accidental cross-product supplier↔location links", () => {
    const answers: WizardAnswers = {
      ...emptyAnswers(),
      organization: {
        ...emptyAnswers().organization,
        locations: ["Downtown", "Midtown"],
      },
      participants: {
        ...emptyAnswers().participants,
        people: [
          { name: "Chef Ana", role: "Head chef" },
          { name: "Sam", role: "Server" },
        ],
      },
      valueAndWork: {
        ...emptyAnswers().valueAndWork,
        projects: [
          { name: "Dinner Menu", client: "Dinner" },
          { name: "Brunch", client: "Brunch" },
        ],
        features: [
          { name: "Cacio e Pepe", project: "Dinner Menu", service: "Main", owner: "Chef Ana" },
          { name: "Eggs Benedict", project: "Brunch", service: "Main", owner: "Chef Ana" },
        ],
      },
      restaurant: {
        suppliers: [{ name: "Green Acres", category: "Produce" }],
        posSystem: "Toast",
        reservationSystem: "Resy",
      },
    };

    const ds = buildRestaurantDataset("Bistro", answers);

    // No supplier→location edges of any kind
    expect(
      ds.relationships.some(
        (r) =>
          (r.relationshipTypeKey.includes("supplier") &&
            r.relationshipTypeKey.includes("location")) ||
          false,
      ),
    ).toBe(false);

    // POS is a vendor, not a supplier
    const toast = ds.records.find((r) => r.displayName === "Toast");
    expect(toast?.recordTypeKey).toBe("vendor");
    const greenAcres = ds.records.find((r) => r.displayName === "Green Acres");
    expect(greenAcres?.recordTypeKey).toBe("supplier");

    // Dishes link to menus; menus link to locations — not dish→location shortcuts
    expect(
      ds.relationships.every((r) => r.relationshipTypeKey !== "dish_at_location"),
    ).toBe(true);

    // Each dish appears on its intended menu only
    const pasta = ds.records.find((r) => r.displayName === "Cacio e Pepe")!;
    const eggs = ds.records.find((r) => r.displayName === "Eggs Benedict")!;
    const dinner = ds.records.find((r) => r.displayName === "Dinner Menu")!;
    const brunch = ds.records.find((r) => r.displayName === "Brunch")!;

    const dishMenu = ds.relationships.filter(
      (r) => r.relationshipTypeKey === "dish_on_menu",
    );
    expect(
      dishMenu.find((r) => r.sourceLocalId === pasta.localId)?.targetLocalId,
    ).toBe(dinner.localId);
    expect(
      dishMenu.find((r) => r.sourceLocalId === eggs.localId)?.targetLocalId,
    ).toBe(brunch.localId);

    // Operational vendors link to locations via location_uses_vendor
    expect(
      ds.relationships.filter((r) => r.relationshipTypeKey === "location_uses_vendor")
        .length,
    ).toBeGreaterThan(0);
  });
});
