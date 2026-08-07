import { test, expect } from "@playwright/test";
import { signUp } from "./helpers";

// The critical journey: sign in → create org → choose industry → complete the
// wizard → review a recommendation with real counts → approve → land on the
// generated workspace.
test("setup wizard to generated workspace", async ({ page }) => {
  const email = `e2e_${Date.now()}@example.com`;
  const orgName = `E2E Studio ${Date.now()}`;

  await signUp(page, email);

  // Create organization.
  await page.getByRole("link", { name: "New organization" }).click();
  await page.getByLabel("Organization name").fill(orgName);
  await page.getByRole("button", { name: /Create & choose industry/ }).click();

  // Choose an industry pack.
  await expect(page.getByRole("heading", { name: /Choose an industry pack/ })).toBeVisible();
  await page.getByRole("button", { name: "Use Generic business" }).click();

  // Wizard: five steps. Advance through each.
  await expect(page.getByRole("heading", { name: /how your organization works/i })).toBeVisible();
  // Step 1: Organization
  await page.getByRole("button", { name: "Continue" }).click();
  // Step 2: Participants — pick Clients.
  await page.getByText("Clients", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  // Step 3: Value & work — add stages and deadlines.
  await page.getByPlaceholder("Intake, In progress, Review, Done").fill("Intake, Active, Done");
  await page.getByText("Deadlines matter to this organization").click();
  await page.getByRole("button", { name: "Continue" }).click();
  // Step 4: Systems
  await page.getByRole("button", { name: "Continue" }).click();
  // Step 5: Security → generate recommendation
  await page.getByRole("button", { name: "Generate recommendation" }).click();

  // Recommendation review with real counts.
  await expect(page.getByRole("heading", { name: /Review .* approve/i })).toBeVisible();
  await expect(page.getByText(/Your recommended operating model includes/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Record types" })).toBeVisible();

  // Approve & generate.
  await page.getByRole("button", { name: /Approve & generate workspace/ }).click();

  // Generated workspace.
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByText("Workspace generated")).toBeVisible();
  await expect(page.getByRole("heading", { name: `${orgName} workspace` })).toBeVisible();
  await expect(page.getByText(/Schema v\d+ is live/)).toBeVisible();
});
