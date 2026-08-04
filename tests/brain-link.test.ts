import { describe, expect, it } from "vitest";
import {
  brainFanOut,
  looksLikeVendor,
  preferredTypesForAnchor,
} from "@/lib/graph/brain-link";

describe("brain-link", () => {
  it("recognizes known vendor names", () => {
    expect(looksLikeVendor("GitHub")).toBe(true);
    expect(looksLikeVendor("github")).toBe(true);
    expect(looksLikeVendor("erik")).toBe(false);
  });

  it("prefers feature/vendor over person when extending from a product", () => {
    const pref = preferredTypesForAnchor("product");
    expect(pref.indexOf("vendor")).toBeLessThan(pref.indexOf("person"));
    expect(pref.indexOf("feature")).toBeLessThan(pref.indexOf("person"));
  });

  it("fans vendor→product out to people on that product", () => {
    const extras = brainFanOut({
      newRecordTypeKey: "vendor",
      primary: {
        relationshipTypeKey: "product_uses_vendor",
        direction: "incoming",
        otherId: "prod1",
        otherTypeKey: "product",
      },
      peopleOnProduct: ["erik", "vance"],
    });
    expect(extras).toHaveLength(2);
    expect(extras.every((e) => e.relationshipTypeKey === "person_uses_vendor")).toBe(
      true,
    );
    expect(extras.map((e) => e.otherId).sort()).toEqual(["erik", "vance"]);
  });
});
