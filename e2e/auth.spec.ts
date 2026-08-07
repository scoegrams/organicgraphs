import { test, expect } from "@playwright/test";
import { TEST_PASSWORD, signIn, signOut, signUp } from "./helpers";

// Auth and invitations against the running app. Requires the dev DB.

test("signed-out visitors cannot reach the app", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("account creation, sign out, and sign back in", async ({ page }) => {
  const email = `e2e_auth_${Date.now()}@example.com`;

  await signUp(page, email, "Ada Lovelace");
  await expect(page.getByText(email)).toBeVisible();

  await signOut(page);
  await expect(page).toHaveURL(/\/(sign-in)?$/);

  await signIn(page, email);
  await expect(page).toHaveURL(/\/app$/);
});

test("the wrong password is refused", async ({ page }) => {
  const email = `e2e_wrong_${Date.now()}@example.com`;
  await signUp(page, email);
  await signOut(page);

  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("alert")).toHaveText(/incorrect/i);
  await expect(page).toHaveURL(/\/sign-in/);
});

test("an unknown email is refused with the same message as a wrong password", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(`e2e_ghost_${Date.now()}@example.com`);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("alert")).toHaveText(/incorrect/i);
});

test("a short password is rejected at signup", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Work email").fill(`e2e_short_${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("alert")).toHaveText(/at least 10 characters/i);
});

test("the same email cannot register twice", async ({ page }) => {
  const email = `e2e_dupe_${Date.now()}@example.com`;
  await signUp(page, email);
  await signOut(page);

  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("alert")).toHaveText(/already exists/i);
});

test("an owner invites a teammate who joins the org", async ({ page }) => {
  const stamp = Date.now();
  const ownerEmail = `e2e_owner_${stamp}@example.com`;
  const guestEmail = `e2e_guest_${stamp}@example.com`;
  const orgName = `Invite Co ${stamp}`;

  // Owner creates an organization.
  await signUp(page, ownerEmail, "Owner");
  await page.getByRole("link", { name: "New organization" }).click();
  await page.getByLabel("Organization name").fill(orgName);
  await page.getByRole("button", { name: /Create & choose industry/ }).click();
  await expect(page).toHaveURL(/\/industry/);

  const orgId = page.url().match(/\/app\/([^/]+)\//)?.[1];
  expect(orgId).toBeTruthy();

  // Owner creates an invite link.
  await page.goto(`/app/${orgId}/members`);
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await page.getByLabel("Email").fill(guestEmail);
  await page.getByLabel("Role").selectOption("MANAGER");
  await page.getByRole("button", { name: "Create invite link" }).click();

  const linkInput = page.locator('input[readonly]');
  await expect(linkInput).toBeVisible();
  const inviteUrl = await linkInput.inputValue();
  expect(inviteUrl).toContain("/invite/");

  // A different account cannot use the link.
  await signOut(page);
  const outsiderEmail = `e2e_outsider_${stamp}@example.com`;
  await signUp(page, outsiderEmail);
  await page.goto(new URL(inviteUrl).pathname);
  await expect(page.getByRole("heading", { name: "Wrong account" })).toBeVisible();

  // The invited person accepts and lands inside the org.
  await signOut(page);
  await page.goto(new URL(inviteUrl).pathname);
  await expect(page.getByRole("heading", { name: new RegExp(`Join ${orgName}`) })).toBeVisible();
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/${orgId}/`));

  // The org now appears in their list.
  await page.goto("/app");
  await expect(page.getByText(orgName)).toBeVisible();
});

test("a private preview is hidden from non-members", async ({ page }) => {
  const stamp = Date.now();
  const ownerEmail = `e2e_priv_${stamp}@example.com`;

  await signUp(page, ownerEmail);
  await page.getByRole("link", { name: "New organization" }).click();
  await page.getByLabel("Organization name").fill(`Private Co ${stamp}`);
  await page.getByRole("button", { name: /Create & choose industry/ }).click();
  const orgId = page.url().match(/\/app\/([^/]+)\//)?.[1];

  // The owner can see their own unpublished preview.
  await page.goto(`/preview/${orgId}`);
  await expect(page.locator("body")).not.toContainText("404");

  // A signed-out visitor cannot.
  await signOut(page);
  const response = await page.goto(`/preview/${orgId}`);
  expect(response?.status()).toBe(404);
});
