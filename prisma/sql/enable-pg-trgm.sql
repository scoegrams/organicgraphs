-- Fuzzy name matching for the company graph.
-- pg_trgm lets us find "Vance" from "vance ", "Vanse", etc. so writes reuse
-- the canonical node instead of spawning near-duplicates.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Record_displayName_trgm"
  ON "Record"
  USING gin ("displayName" gin_trgm_ops);
