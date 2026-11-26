import { expect, type Page } from "@playwright/test";

export class LoginPage {
  constructor(readonly page: Page) {}

  async login(email = "demo@gmail.com", password = "Password123") {
    await this.page.goto("/login");
    await this.page.locator('input[type="email"]').fill("demo@gmail.com");
    await this.page.locator('input[type="password"]').fill("Password123");
    await expect(this.page.locator('input[type="email"]')).toHaveValue("demo@gmail.com");
    await this.page.locator('input[type="email"]').fill(email);
    await this.page.locator('input[type="password"]').fill(password);
    await this.page.locator('form button[type="submit"]').click();
    await expect(this.page).toHaveURL(/\/app\/today$/);
  }
}
