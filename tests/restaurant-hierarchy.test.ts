import { describe, expect, it } from "vitest";
import { restaurantPack } from "@/lib/packs/restaurant";
import {
  RESTAURANT_CANONICAL_RELS,
  RESTAURANT_VISUAL_RANK,
  allowsSelfRelationship,
  dishesAtLocation,
  isOperationalVendorCategory,
  restaurantVisualRank,
} from "@/lib/graph/restaurant-hierarchy";
import { buildRestaurantDataset } from "@/lib/demo/seed";
import { emptyAnswers, type WizardAnswers } from "@/lib/wizard";

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------
function restaurantAnswers(): WizardAnswers {
  return {
    ...emptyAnswers(),
    organization: {
      ...emptyAnswers().organization,
      locations: ["Downtown", "Midtown"],
    },
    participants: {
      ...emptyAnswers().participants,
      people: [
        { name: "Chef Ana", role: "Head chef" },
        { name: "Sam",      role: "Server" },
        { name: "Jordan",   role: "Owner" },
      ],
    },
    valueAndWork: {
      ...emptyAnswers().valueAndWork,
      projects: [
        { name: "Dinner Menu", client: "Dinner" },
        { name: "Brunch",      client: "Brunch" },
      ],
      features: [
        { name: "Cacio e Pepe",  project: "Dinner Menu", service: "Main", owner: "Chef Ana" },
        { name: "Eggs Benedict", project: "Brunch",      service: "Main", owner: "Chef Ana" },
      ],
    },
    restaurant: {
      suppliers: [{ name: "Green Acres", category: "Produce" }],
      operationalVendors: [
        { name: "Toast",     category: "POS" },
        { name: "OpenTable", category: "Reservations" },
      ],
    },
  };
}

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
        (e) => e.relationshipTypeKey === "menu_at_location" && e.sourceId === "loc_dt",
      ),
    ).toBe(false);
  });

  // Supplier→dish derivation, its dedup, and its retraction now live in the
  // shared inference engine and are covered by tests/graph-inference.test.ts.

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
    expect(RESTAURANT_VISUAL_RANK["team"]).toBe(1);
    expect(RESTAURANT_VISUAL_RANK["staff"]).toBe(2);
    expect(restaurantVisualRank("dish")).toBe(3);
    expect(restaurantVisualRank("ingredient")).toBe(4);
    expect(restaurantVisualRank("supplier")).toBe(5);
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

  it("staff auto-group into teams based on role", () => {
    const ds = buildRestaurantDataset("Bistro", restaurantAnswers());

    // Team nodes exist
    const teams = ds.records.filter((r) => r.recordTypeKey === "team");
    expect(teams.length).toBeGreaterThan(0);
    const teamTypes = teams.map((t) => (t.values as Record<string, string>).type);
    expect(teamTypes).toContain("Kitchen");
    expect(teamTypes).toContain("Front of house");
    expect(teamTypes).toContain("Management");

    // Chef Ana → Kitchen team
    const ana = ds.records.find((r) => r.displayName === "Chef Ana")!;
    const kitchenTeam = ds.records.find(
      (r) => r.recordTypeKey === "team" && (r.values as Record<string, string>).type === "Kitchen",
    )!;
    expect(
      ds.relationships.some(
        (r) =>
          r.relationshipTypeKey === "staff_in_team" &&
          r.sourceLocalId === ana.localId &&
          r.targetLocalId === kitchenTeam.localId,
      ),
    ).toBe(true);

    // Sam → Front of house team
    const sam = ds.records.find((r) => r.displayName === "Sam")!;
    const fohTeam = ds.records.find(
      (r) =>
        r.recordTypeKey === "team" &&
        (r.values as Record<string, string>).type === "Front of house",
    )!;
    expect(
      ds.relationships.some(
        (r) =>
          r.relationshipTypeKey === "staff_in_team" &&
          r.sourceLocalId === sam.localId &&
          r.targetLocalId === fohTeam.localId,
      ),
    ).toBe(true);

    // Teams link to locations via team_at_location
    const teamLoc = ds.relationships.filter(
      (r) => r.relationshipTypeKey === "team_at_location",
    );
    expect(teamLoc.length).toBeGreaterThan(0);
    // Each team links to each location
    for (const team of teams) {
      const locLinks = teamLoc.filter((r) => r.sourceLocalId === team.localId);
      expect(locLinks.length).toBe(2); // 2 locations: Downtown + Midtown
    }
  });

  it("operational vendors all become Vendor nodes linked to locations (not suppliers)", () => {
    const ds = buildRestaurantDataset("Bistro", restaurantAnswers());

    const toast = ds.records.find((r) => r.displayName === "Toast");
    const openTable = ds.records.find((r) => r.displayName === "OpenTable");
    expect(toast?.recordTypeKey).toBe("vendor");
    expect(openTable?.recordTypeKey).toBe("vendor");

    // Green Acres is a supplier, not a vendor
    const greenAcres = ds.records.find((r) => r.displayName === "Green Acres");
    expect(greenAcres?.recordTypeKey).toBe("supplier");

    // Vendor→location links via location_uses_vendor (2 locations × 2 vendors = 4)
    const vendorLinks = ds.relationships.filter(
      (r) => r.relationshipTypeKey === "location_uses_vendor",
    );
    expect(vendorLinks.length).toBe(4);

    // No supplier→location edges
    expect(
      ds.relationships.some(
        (r) =>
          r.relationshipTypeKey.includes("supplier") &&
          r.relationshipTypeKey.includes("location"),
      ),
    ).toBe(false);
  });

  it("dishes link to their own menus and not to other menus", () => {
    const ds = buildRestaurantDataset("Bistro", restaurantAnswers());

    const pasta  = ds.records.find((r) => r.displayName === "Cacio e Pepe")!;
    const eggs   = ds.records.find((r) => r.displayName === "Eggs Benedict")!;
    const dinner = ds.records.find((r) => r.displayName === "Dinner Menu")!;
    const brunch = ds.records.find((r) => r.displayName === "Brunch")!;

    const dishMenuRels = ds.relationships.filter(
      (r) => r.relationshipTypeKey === "dish_on_menu",
    );
    expect(
      dishMenuRels.find((r) => r.sourceLocalId === pasta.localId)?.targetLocalId,
    ).toBe(dinner.localId);
    expect(
      dishMenuRels.find((r) => r.sourceLocalId === eggs.localId)?.targetLocalId,
    ).toBe(brunch.localId);
    // No shortcut dish→location edges invented
    expect(
      ds.relationships.every((r) => r.relationshipTypeKey !== "dish_at_location"),
    ).toBe(true);
  });
});
