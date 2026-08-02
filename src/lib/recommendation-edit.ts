import {
  SchemaRecommendationSchema,
  type SchemaRecommendation,
} from "@/lib/meta-model";

export type EditableCategory =
  | "recordTypes"
  | "relationshipTypes"
  | "permissionGroups"
  | "workflows"
  | "dashboards"
  | "healthChecks";

export class EditError extends Error {}

/** Parse a stored payload back into a validated recommendation. */
export function loadPayload(payload: unknown): SchemaRecommendation {
  return SchemaRecommendationSchema.parse(payload);
}

/**
 * Remove an item by key from a category, cascading to keep the model valid:
 * removing a record type also removes relationships and workflows that depend
 * on it; removing the default permission group promotes another to default.
 */
export function removeItem(
  rec: SchemaRecommendation,
  category: EditableCategory,
  key: string,
): SchemaRecommendation {
  const next: SchemaRecommendation = structuredClone(rec);

  switch (category) {
    case "recordTypes": {
      if (next.recordTypes.length <= 1) {
        throw new EditError("An operating model needs at least one record type.");
      }
      next.recordTypes = next.recordTypes.filter((r) => r.key !== key);
      next.relationshipTypes = next.relationshipTypes.filter(
        (r) => r.sourceTypeKey !== key && r.targetTypeKey !== key,
      );
      next.workflows = next.workflows.filter((w) => w.recordTypeKey !== key);
      break;
    }
    case "relationshipTypes":
      next.relationshipTypes = next.relationshipTypes.filter((r) => r.key !== key);
      break;
    case "permissionGroups": {
      if (next.permissionGroups.length <= 1) {
        throw new EditError("At least one permission group is required.");
      }
      const removed = next.permissionGroups.find((g) => g.key === key);
      next.permissionGroups = next.permissionGroups.filter((g) => g.key !== key);
      if (removed?.isDefault && !next.permissionGroups.some((g) => g.isDefault)) {
        next.permissionGroups[0]!.isDefault = true;
      }
      break;
    }
    case "workflows":
      next.workflows = next.workflows.filter((w) => w.key !== key);
      break;
    case "dashboards":
      next.dashboards = next.dashboards.filter((d) => d.key !== key);
      break;
    case "healthChecks":
      next.healthChecks = next.healthChecks.filter((h) => h.key !== key);
      break;
  }

  // Re-validate so we never persist an inconsistent model.
  return SchemaRecommendationSchema.parse(next);
}

/** Rename the display name of an item (identity keys never change). */
export function renameItem(
  rec: SchemaRecommendation,
  category: EditableCategory,
  key: string,
  name: string,
): SchemaRecommendation {
  const clean = name.trim();
  if (!clean) throw new EditError("Name cannot be empty.");
  const next: SchemaRecommendation = structuredClone(rec);
  const list = next[category] as Array<{ key: string; name: string }>;
  const item = list.find((i) => i.key === key);
  if (!item) throw new EditError("Item not found.");
  item.name = clean;
  return SchemaRecommendationSchema.parse(next);
}
