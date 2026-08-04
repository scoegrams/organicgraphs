import { describe, expect, it } from "vitest";
import { normalizeName } from "@/lib/graph/names";

// fuzzyFindRecords / findCanonicalRecord need a live Postgres with pg_trgm;
// these cover the pure helpers used on every write path.

describe("normalizeName", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeName("  Vance  Chen ")).toBe("vance chen");
    expect(normalizeName("vance")).toBe("vance");
    expect(normalizeName("VANCE\t  ")).toBe("vance");
  });
});
