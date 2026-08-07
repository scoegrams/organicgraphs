import { describe, expect, it } from "vitest";
import {
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
});
