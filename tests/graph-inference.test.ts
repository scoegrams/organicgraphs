import { describe, expect, it } from "vitest";
import {
  runInference,
  unsupportedInferredEdges,
  type GraphEdge,
  type GraphNode,
} from "@/lib/graph/inference/engine";
import {
  restaurantInferenceRules,
  softwareInferenceRules,
} from "@/lib/graph/inference/rules";

function node(id: string, typeKey: string, values?: Record<string, unknown>): GraphNode {
  return { id, typeKey, displayName: id, values };
}

function edge(relationshipTypeKey: string, sourceId: string, targetId: string): GraphEdge {
  return { relationshipTypeKey, sourceId, targetId };
}

const rest = restaurantInferenceRules;

describe("restaurant supply-chain inference", () => {
  const nodes = [
    node("sysco", "supplier"),
    node("tomato", "ingredient"),
    node("basil", "ingredient"),
    node("bisque", "dish"),
    node("dinner", "menu"),
    node("downtown", "location"),
  ];

  it("derives supplier → dish only through a shared ingredient", () => {
    const edges = [
      edge("supplier_provides_ingredient", "sysco", "tomato"),
      edge("dish_uses_ingredient", "bisque", "tomato"),
    ];
    const inferred = runInference(rest, nodes, edges);
    const supplierDish = inferred.filter((e) => e.relationshipTypeKey === "supplier_provides_dish");

    expect(supplierDish).toHaveLength(1);
    expect(supplierDish[0]).toMatchObject({ sourceId: "sysco", targetId: "bisque", support: 1 });
  });

  it("does not derive supplier → dish when no ingredient is shared", () => {
    const edges = [
      edge("supplier_provides_ingredient", "sysco", "basil"),
      edge("dish_uses_ingredient", "bisque", "tomato"),
    ];
    const inferred = runInference(rest, nodes, edges);
    expect(inferred.filter((e) => e.relationshipTypeKey === "supplier_provides_dish")).toHaveLength(0);
  });

  it("deduplicates to one edge but raises confidence with more supporting paths", () => {
    const one = runInference(rest, nodes, [
      edge("supplier_provides_ingredient", "sysco", "tomato"),
      edge("dish_uses_ingredient", "bisque", "tomato"),
    ]).find((e) => e.relationshipTypeKey === "supplier_provides_dish");

    const two = runInference(rest, nodes, [
      edge("supplier_provides_ingredient", "sysco", "tomato"),
      edge("supplier_provides_ingredient", "sysco", "basil"),
      edge("dish_uses_ingredient", "bisque", "tomato"),
      edge("dish_uses_ingredient", "bisque", "basil"),
    ]).find((e) => e.relationshipTypeKey === "supplier_provides_dish");

    expect(two?.support).toBe(2);
    expect(two!.confidence).toBeGreaterThan(one!.confidence);
    expect(two!.confidence).toBeLessThan(1);
  });

  it("walks three hops to reach supplier → menu", () => {
    const edges = [
      edge("supplier_provides_ingredient", "sysco", "tomato"),
      edge("dish_uses_ingredient", "bisque", "tomato"),
      edge("dish_on_menu", "bisque", "dinner"),
    ];
    const inferred = runInference(rest, nodes, edges);
    expect(inferred).toContainEqual(
      expect.objectContaining({
        relationshipTypeKey: "supplier_for_menu",
        sourceId: "sysco",
        targetId: "dinner",
      }),
    );
  });

  it("retracts a derived edge once its supporting ingredient path is gone", () => {
    const derived = edge("supplier_provides_dish", "sysco", "bisque");
    const remaining = [edge("supplier_provides_ingredient", "sysco", "tomato"), derived];

    const dropped = unsupportedInferredEdges(rest, nodes, remaining, [
      { ...derived, ruleKey: "supplier_dish_via_ingredient" },
    ]);
    expect(dropped).toContainEqual(derived);
  });

  it("keeps a derived edge while any supporting path survives", () => {
    const derived = edge("supplier_provides_dish", "sysco", "bisque");
    const remaining = [
      edge("supplier_provides_ingredient", "sysco", "basil"),
      edge("dish_uses_ingredient", "bisque", "basil"),
      derived,
    ];

    const dropped = unsupportedInferredEdges(rest, nodes, remaining, [
      { ...derived, ruleKey: "supplier_dish_via_ingredient" },
    ]);
    expect(dropped).toHaveLength(0);
  });
});

describe("restaurant staffing inference", () => {
  it("places staff at the location their team is based at", () => {
    const nodes = [
      node("ana", "staff"),
      node("kitchen", "team"),
      node("downtown", "location"),
    ];
    const edges = [
      edge("staff_in_team", "ana", "kitchen"),
      edge("team_at_location", "kitchen", "downtown"),
    ];
    const inferred = runInference(rest, nodes, edges);
    expect(inferred).toContainEqual(
      expect.objectContaining({
        relationshipTypeKey: "staff_works_at",
        sourceId: "ana",
        targetId: "downtown",
      }),
    );
  });

  it("does not restate a staff → location edge that already exists", () => {
    const nodes = [node("ana", "staff"), node("kitchen", "team"), node("downtown", "location")];
    const edges = [
      edge("staff_in_team", "ana", "kitchen"),
      edge("team_at_location", "kitchen", "downtown"),
      edge("staff_works_at", "ana", "downtown"),
    ];
    const inferred = runInference(rest, nodes, edges);
    expect(inferred.filter((e) => e.relationshipTypeKey === "staff_works_at")).toHaveLength(0);
  });
});

describe("vendor integration guard", () => {
  const nodes = [
    node("toast", "vendor", { category: "POS" }),
    node("opentable", "vendor", { category: "Reservations" }),
    node("cintas", "vendor", { category: "Linen & laundry" }),
    node("downtown", "location"),
  ];
  const edges = [
    edge("location_uses_vendor", "downtown", "toast"),
    edge("location_uses_vendor", "downtown", "opentable"),
    edge("location_uses_vendor", "downtown", "cintas"),
  ];

  it("links a POS to a reservation system sharing a location", () => {
    const pairs = runInference(rest, nodes, edges)
      .filter((e) => e.relationshipTypeKey === "vendor_integrates_with")
      .map((e) => [e.sourceId, e.targetId].sort().join("+"));

    expect([...new Set(pairs)]).toEqual(["opentable+toast"]);
  });

  it("never links a vendor to itself", () => {
    const selfEdges = runInference(rest, nodes, edges).filter((e) => e.sourceId === e.targetId);
    expect(selfEdges).toHaveLength(0);
  });
});

describe("software inference", () => {
  it("puts a feature owner on the product team", () => {
    const nodes = [node("erik", "person"), node("checkout", "feature"), node("storefront", "product")];
    const edges = [
      edge("person_owns_feature", "erik", "checkout"),
      edge("feature_belongs_to_product", "checkout", "storefront"),
    ];
    const inferred = runInference(softwareInferenceRules, nodes, edges);
    expect(inferred).toContainEqual(
      expect.objectContaining({
        relationshipTypeKey: "person_member_of_product",
        sourceId: "erik",
        targetId: "storefront",
      }),
    );
  });

  it("hosts a repository only on a vendor that can host code", () => {
    const nodes = [
      node("web-repo", "repository"),
      node("storefront", "product"),
      node("github", "vendor", { category: "Dev tools" }),
      node("stripe", "vendor", { category: "Payments" }),
    ];
    const edges = [
      edge("product_has_repository", "storefront", "web-repo"),
      edge("product_uses_vendor", "storefront", "github"),
      edge("product_uses_vendor", "storefront", "stripe"),
    ];
    const hosts = runInference(softwareInferenceRules, nodes, edges)
      .filter((e) => e.relationshipTypeKey === "repository_hosted_on_vendor")
      .map((e) => e.targetId);

    expect(hosts).toEqual(["github"]);
  });

  it("reaches a vendor two different ways and merges into one edge", () => {
    const nodes = [
      node("erik", "person"),
      node("storefront", "product"),
      node("api", "service"),
      node("github", "vendor", { category: "Dev tools" }),
    ];
    const edges = [
      edge("person_member_of_product", "erik", "storefront"),
      edge("product_uses_vendor", "storefront", "github"),
      edge("person_operates_service", "erik", "api"),
      edge("service_hosted_on_vendor", "api", "github"),
    ];
    const uses = runInference(softwareInferenceRules, nodes, edges).filter(
      (e) => e.relationshipTypeKey === "person_uses_vendor",
    );

    expect(uses).toHaveLength(1);
    expect(uses[0]!.support).toBe(2);
  });
});

describe("chained reasoning", () => {
  // Erik owns a feature on Storefront, and the Storefront team runs on Slack.
  // Nobody stated that Erik is on the product or that he touches Slack.
  const nodes = [
    node("erik", "person"),
    node("checkout", "feature"),
    node("storefront", "product"),
    node("slack", "vendor", { category: "Comms" }),
  ];
  const edges = [
    edge("person_owns_feature", "erik", "checkout"),
    edge("feature_belongs_to_product", "checkout", "storefront"),
    edge("product_uses_vendor", "storefront", "slack"),
  ];

  it("reaches a conclusion that depends on another inference", () => {
    const inferred = runInference(softwareInferenceRules, nodes, edges);
    const keys = inferred.map((e) => `${e.sourceId}-${e.relationshipTypeKey}-${e.targetId}`);

    expect(keys).toContain("erik-person_member_of_product-storefront");
    expect(keys).toContain("erik-person_uses_vendor-slack");
  });

  it("holds a chained conclusion below the inference it was built on", () => {
    const inferred = runInference(softwareInferenceRules, nodes, edges);
    const membership = inferred.find((e) => e.relationshipTypeKey === "person_member_of_product");
    const vendorUse = inferred.find((e) => e.relationshipTypeKey === "person_uses_vendor");

    expect(vendorUse!.confidence).toBeLessThan(membership!.confidence);
  });

  it("retracts the whole chain when the first link is removed", () => {
    const derived = [
      { ...edge("person_member_of_product", "erik", "storefront"), ruleKey: "person_product_via_feature" },
      { ...edge("person_uses_vendor", "erik", "slack"), ruleKey: "person_vendor_via_product" },
    ];
    // Erik no longer owns the feature.
    const remaining = [
      edge("feature_belongs_to_product", "checkout", "storefront"),
      edge("product_uses_vendor", "storefront", "slack"),
      ...derived.map(({ relationshipTypeKey, sourceId, targetId }) => ({
        relationshipTypeKey,
        sourceId,
        targetId,
      })),
    ];

    const dropped = unsupportedInferredEdges(softwareInferenceRules, nodes, remaining, derived);
    expect(dropped).toHaveLength(2);
  });
});

describe("fan-out limiting", () => {
  it("refuses a conclusion that would point one person at every provider", () => {
    // One product wired to nine tools. Concluding that its engineer personally
    // uses all nine is the hairball this limit exists to prevent.
    const vendors = Array.from({ length: 9 }, (_, i) =>
      node(`tool-${i}`, "vendor", { category: "Dev tools" }),
    );
    const nodes = [node("sam", "person"), node("diamond", "product"), ...vendors];
    const edges = [
      edge("person_member_of_product", "sam", "diamond"),
      ...vendors.map((v) => edge("product_uses_vendor", "diamond", v.id)),
    ];

    const uses = runInference(softwareInferenceRules, nodes, edges).filter(
      (e) => e.relationshipTypeKey === "person_uses_vendor",
    );
    expect(uses).toHaveLength(0);
  });

  it("still draws the conclusion when it stays discriminating", () => {
    const nodes = [
      node("sam", "person"),
      node("diamond", "product"),
      node("slack", "vendor", { category: "Comms" }),
      node("figma", "vendor", { category: "Design" }),
    ];
    const edges = [
      edge("person_member_of_product", "sam", "diamond"),
      edge("product_uses_vendor", "diamond", "slack"),
      edge("product_uses_vendor", "diamond", "figma"),
    ];

    const uses = runInference(softwareInferenceRules, nodes, edges).filter(
      (e) => e.relationshipTypeKey === "person_uses_vendor",
    );
    expect(uses.map((e) => e.targetId).sort()).toEqual(["figma", "slack"]);
  });

  it("does not put a person on infrastructure their product merely runs on", () => {
    const nodes = [
      node("sam", "person"),
      node("diamond", "product"),
      node("fly", "vendor", { category: "Hosting" }),
      node("stripe", "vendor", { category: "Payments" }),
    ];
    const edges = [
      edge("person_member_of_product", "sam", "diamond"),
      edge("product_uses_vendor", "diamond", "fly"),
      edge("product_uses_vendor", "diamond", "stripe"),
    ];

    expect(
      runInference(softwareInferenceRules, nodes, edges).filter(
        (e) => e.relationshipTypeKey === "person_uses_vendor",
      ),
    ).toHaveLength(0);
  });
});

describe("engine safety", () => {
  it("terminates on a cyclic graph without revisiting nodes", () => {
    const nodes = [node("a", "dish"), node("b", "dish"), node("c", "dish")];
    const edges = [
      edge("dish_paired_with", "a", "b"),
      edge("dish_paired_with", "b", "c"),
      edge("dish_paired_with", "c", "a"),
    ];
    expect(() => runInference(rest, nodes, edges)).not.toThrow();
  });

  it("infers nothing from an empty graph", () => {
    expect(runInference(rest, [], [])).toEqual([]);
  });
});
