/**
 * "Brain" linking: when you attach a node to an anchor, also wire the natural
 * secondary edges so the graph densifies instead of leaving orphan spokes.
 *
 * Pure helpers — the server action applies these as additional connections.
 */

export interface BrainEdge {
  relationshipTypeKey: string;
  direction: "outgoing" | "incoming";
  otherId: string;
  rationale: string;
}

/** When auto-connecting a repository, we may also want to link to a vendor. */
export interface BrainEdgeWithHint extends BrainEdge {
  /** If true the caller should look up an existing vendor of this name and wire to it. */
  vendorHint?: string;
}

/** Known SaaS / infra names that should default to the Vendor type. */
const VENDOR_HINTS =
  /^(github|gitlab|bitbucket|vercel|netlify|railway|render|aws|amazon web services|google cloud|gcp|azure|stripe|sentry|datadog|posthog|figma|slack|notion|linear|jira|cursor|resend|sendgrid|cloudflare|spaceship|heroku|digitalocean|supabase|firebase|auth0|okta|twilio|segment|mixpanel)$/i;

export function looksLikeVendor(name: string): boolean {
  return VENDOR_HINTS.test(name.trim());
}

/**
 * Preferred record-type order when extending FROM a given anchor type.
 * Person is intentionally late for products — otherwise "Build from apple.com"
 * defaults to investor and GitHub ends up attached to a person.
 */
export function preferredTypesForAnchor(anchorTypeKey: string): string[] {
  switch (anchorTypeKey) {
    case "product":
      return [
        "feature",
        "person",
        "vendor",
        "service",
        "customer",
        "repository",
      ];
    case "customer":
      return ["product", "person", "subscription"];
    case "feature":
      return ["feature", "person", "service", "product", "ticket"];
    case "person":
      return ["feature", "product", "vendor", "service", "person"];
    case "service":
      return ["vendor", "product", "person", "feature", "repository"];
    case "vendor":
      // location first for restaurant operational vendors; repository for software hosts.
      return ["location", "repository", "product", "service", "person"];
    case "repository":
      return ["product", "vendor", "service", "feature"];
    // Restaurant / hospitality
    case "location":
      return ["menu", "staff", "event", "vendor"];
    case "menu":
      return ["dish", "location"];
    case "dish":
      return ["ingredient", "menu", "staff", "dish"];
    case "ingredient":
      return ["supplier", "dish"];
    case "supplier":
      return ["ingredient"];
    case "staff":
      return ["dish", "location"];
    case "event":
      return ["location"];
    default:
      return [];
  }
}

/**
 * Given a primary edge we're about to write, suggest additional edges that
 * keep the graph brain-like. `neighbors` are already-related record ids of the
 * given type (resolved by the caller from the DB).
 */
export function brainFanOut(input: {
  newRecordTypeKey: string;
  primary: {
    relationshipTypeKey: string;
    direction: "outgoing" | "incoming";
    otherId: string;
    otherTypeKey: string;
  };
  /** People already linked to the product (investors, feature owners). */
  peopleOnProduct?: string[];
  /** Products already linked to the person. */
  productsOfPerson?: string[];
  /** Vendors already linked to the product. */
  vendorsOfProduct?: string[];
  /** Products already linked to the vendor. */
  productsOfVendor?: string[];
}): BrainEdge[] {
  const out: BrainEdge[] = [];
  const { newRecordTypeKey, primary } = input;

  // Vendor ↔ Product: also let every person on that product "use" the vendor.
  if (
    newRecordTypeKey === "vendor" &&
    primary.otherTypeKey === "product" &&
    (primary.relationshipTypeKey === "product_uses_vendor" ||
      primary.relationshipTypeKey.endsWith("uses_vendor"))
  ) {
    for (const personId of input.peopleOnProduct ?? []) {
      out.push({
        relationshipTypeKey: "person_uses_vendor",
        direction: "incoming", // person → vendor
        otherId: personId,
        rationale: "People on this product also use this provider",
      });
    }
  }

  // Service ↔ Product: if someone operates services on related products, skip
  // for now — product link is the primary brain edge.

  // Person ↔ Product (investor): no auto vendor fan-out.

  // Vendor ↔ Person: also attach vendor to that person's products.
  if (
    newRecordTypeKey === "vendor" &&
    primary.otherTypeKey === "person" &&
    primary.relationshipTypeKey === "person_uses_vendor"
  ) {
    for (const productId of input.productsOfPerson ?? []) {
      out.push({
        relationshipTypeKey: "product_uses_vendor",
        direction: "incoming", // product → vendor
        otherId: productId,
        rationale: "Products this person works on also use this provider",
      });
    }
  }

  // Repository ↔ Product: also link the repository to every vendor the product uses.
  // e.g. "acme/web" (repo) + apple.com (product) → also wires acme/web → GitHub.
  if (
    newRecordTypeKey === "repository" &&
    primary.otherTypeKey === "product" &&
    (primary.relationshipTypeKey === "product_has_repository" ||
      primary.relationshipTypeKey === "service_in_repository")
  ) {
    for (const vendorId of input.vendorsOfProduct ?? []) {
      out.push({
        relationshipTypeKey: "repository_hosted_on_vendor",
        direction: "outgoing", // repo → vendor
        otherId: vendorId,
        rationale: "Repository is hosted on a provider already used by this product",
      });
    }
  }

  // Repository ↔ Vendor: also link the repository to every product that uses that vendor.
  // e.g. "acme/web" → GitHub, and apple.com already uses GitHub → link apple.com has acme/web.
  if (
    newRecordTypeKey === "repository" &&
    primary.otherTypeKey === "vendor" &&
    primary.relationshipTypeKey === "repository_hosted_on_vendor"
  ) {
    for (const productId of input.productsOfVendor ?? []) {
      out.push({
        relationshipTypeKey: "product_has_repository",
        direction: "incoming", // product → repository
        otherId: productId,
        rationale: "Product already uses this vendor; repository belongs to it",
      });
    }
  }

  return out;
}
