import { describe, it, expect } from "vitest";
import {
  expandNodeSuggestions,
  parseRepoSuggestions,
  toProposalSet,
  refIsNew,
  refId,
  type ExistingNode,
  type GraphSchema,
} from "@/lib/graph/proposals";

const schema: GraphSchema = {
  types: [
    { key: "product", name: "Product", fields: [] },
    { key: "feature", name: "Feature", fields: [] },
    { key: "person", name: "Person", fields: [] },
    { key: "vendor", name: "Provider", fields: [] },
  ],
  relationshipTypes: [
    {
      key: "feature_belongs_to_product",
      sourceTypeKey: "feature",
      targetTypeKey: "product",
      forwardLabel: "belongs to",
      reverseLabel: "has feature",
    },
    {
      key: "person_owns_feature",
      sourceTypeKey: "person",
      targetTypeKey: "feature",
      forwardLabel: "owns",
      reverseLabel: "owned by",
    },
    {
      key: "product_uses_vendor",
      sourceTypeKey: "product",
      targetTypeKey: "vendor",
      forwardLabel: "uses",
      reverseLabel: "used by",
    },
  ],
};

const productAnchor: ExistingNode = {
  id: "p1",
  name: "Car Nodes App",
  typeKey: "product",
  typeName: "Product",
};

describe("graph proposals — ref helpers", () => {
  it("parses refs", () => {
    expect(refIsNew("new:n0")).toBe(true);
    expect(refIsNew("existing:abc")).toBe(false);
    expect(refId("existing:abc")).toBe("abc");
    expect(refId("new:n3")).toBe("n3");
  });
});

describe("graph proposals — expand", () => {
  it("suggests neighbouring types for a product anchor", () => {
    const s = expandNodeSuggestions(productAnchor, schema);
    const keys = s.map((x) => x.recordTypeKey).sort();
    // Product connects to Feature (has feature) and Vendor (uses).
    expect(keys).toContain("feature");
    expect(keys).toContain("vendor");
    // Direction is relative to the NEW node.
    const feat = s.find((x) => x.recordTypeKey === "feature");
    expect(feat?.direction).toBe("outgoing"); // feature is source of belongs_to
    const vend = s.find((x) => x.recordTypeKey === "vendor");
    expect(vend?.direction).toBe("incoming"); // product(anchor) is source of uses
  });

  it("produces a valid proposal set with anchored edges", () => {
    const s = expandNodeSuggestions(productAnchor, schema);
    const set = toProposalSet(productAnchor, s, schema, "deterministic", "x");
    expect(set.nodes.length).toBe(set.edges.length);
    for (const e of set.edges) {
      const refs = [e.sourceRef, e.targetRef];
      expect(refs.some((r) => r === `existing:${productAnchor.id}`)).toBe(true);
      expect(refs.some((r) => r.startsWith("new:"))).toBe(true);
    }
  });

  it("drops suggestions whose keys don't match the schema", () => {
    const set = toProposalSet(
      productAnchor,
      [
        {
          recordTypeKey: "feature",
          displayName: "X",
          relationshipTypeKey: "nonexistent_rel",
          direction: "outgoing",
          confidence: 1,
        },
      ],
      schema,
      "deterministic",
      "x",
    );
    expect(set.nodes.length).toBe(0);
  });
});

describe("graph proposals — repo parse", () => {
  it("extracts dependencies from package.json as providers", () => {
    const pkg = JSON.stringify({
      name: "car-nodes",
      dependencies: { stripe: "^1", "@types/node": "^20", react: "^19" },
      devDependencies: { vitest: "^2" },
    });
    const s = parseRepoSuggestions(pkg, productAnchor, schema);
    const names = s.map((x) => x.displayName);
    expect(names).toContain("stripe");
    // Stop-words / @types are excluded.
    expect(names).not.toContain("react");
    expect(names).not.toContain("@types/node");
    expect(names).not.toContain("vitest");
    expect(s.every((x) => x.recordTypeKey === "vendor")).toBe(true);
  });

  it("extracts features from file paths when no package.json", () => {
    const paths = [
      "src/app/billing/page.tsx",
      "src/features/checkout/index.ts",
      "README.md",
    ].join("\n");
    const s = parseRepoSuggestions(paths, productAnchor, schema);
    const names = s.map((x) => x.displayName);
    expect(names).toContain("Billing");
    expect(names).toContain("Checkout");
    expect(s.every((x) => x.recordTypeKey === "feature")).toBe(true);
  });
});
