import { expect, type Page } from "@playwright/test";

export const TEST_PASSWORD = "e2e-correct-horse-battery";

/** Registers a fresh account and lands on /app. */
export async function signUp(page: Page, email: string, name?: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByRole("tab", { name: "Create account" }).click();
  if (name) await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signOut(page: Page): Promise<void> {
  await page.goto("/app");
  await page.getByRole("button", { name: /sign out/i }).click();
}
