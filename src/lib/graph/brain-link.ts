/**
 * Builder affordances for choosing what to attach next.
 *
 * Secondary edge inference used to live here as hardcoded branches. It is now
 * declared as path rules in `graph/inference/rules.ts`; what remains are the
 * UX hints the record builder uses to order and preselect types.
 */

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
      // Person stays late: extending a product should reach for what the
      // product is built from before reaching for who touched it.
      return [
        "feature",
        "vendor",
        "service",
        "repository",
        "customer",
        "person",
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
      return ["location", "vendor", "repository", "product", "service", "person"];
    case "repository":
      return ["product", "vendor", "service", "feature"];
    // Restaurant / hospitality
    case "location":
      return ["menu", "staff", "event", "vendor"];
    case "menu":
      return ["dish", "location", "supplier"];
    case "dish":
      return ["ingredient", "menu", "staff", "dish"];
    case "ingredient":
      return ["supplier", "dish"];
    case "supplier":
      return ["ingredient", "menu", "dish"];
    case "staff":
      return ["dish", "location"];
    case "event":
      return ["location"];
    default:
      return [];
  }
}
