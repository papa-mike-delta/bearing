import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";
import { generateTOTPCode } from "../src/lib/auth";

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("bearing-onboarded", "true"),
  );
});

test("invitation-only registration creates an isolated account and one canonical Me", async ({
  page,
}, testInfo) => {
  const db = new PrismaClient();
  try {
    const token = randomBytes(32).toString("hex"),
      email = `invited-${Date.now()}@example.test`;
    await db.invitation.create({
      data: {
        email,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await page.goto(`/login?invite=${token}`);
    await expect(
      page.getByLabel("Invitation code", { exact: true }),
    ).toHaveValue(token);
    await page
      .getByPlaceholder("Your name", { exact: true })
      .fill("Invited Person");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill("Password123");
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(/\/app\/today$/);
    const me = await (await page.request.get("/api/v1/me")).json();
    expect(me).toMatchObject({ type: "person", title: "Me" });
    const items = await (await page.request.get("/api/v1/items")).json();
    expect(items).toHaveLength(1);
    const retry = await page.request.post("/api/auth/register", {
      data: { email, token, password: "Password123" },
    });
    expect(retry.status()).toBe(403);
    await page.screenshot({
      path: testInfo.outputPath("invited-empty-account.png"),
      animations: "disabled",
    });
  } finally {
    await db.$disconnect();
  }
});

test("pending 2FA stays on verification after reload and cannot read either data model", async ({
  page,
}) => {
  const db = new PrismaClient(),
    secret = "JBSWY3DPEHPK3PXP";
  try {
    await db.account.update({
      where: { email: "demo@gmail.com" },
      data: { totpSecret: secret, totpVerified: true },
    });
    await page.goto("/login");
    await page.locator('input[type="email"]').fill("demo@gmail.com");
  await page.locator('input[type="password"]').fill("Password123");
    await page.locator('form button[type="submit"]').click();
    await expect(
      page.getByRole("heading", {
        name: "Two-factor verification",
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Two-factor verification",
        exact: true,
      }),
    ).toBeVisible();
    expect((await page.request.get("/api/v1/items")).status()).toBe(401);
    expect((await page.request.get("/api/items")).status()).toBe(401);
    expect(
      (await page.request.post("/api/auth/setup-2fa", { data: {} })).status(),
    ).toBe(401);
    expect(
      (
        await page.request.post("/api/auth/qr-login", {
          data: { action: "confirm", token: "untrusted" },
        })
      ).status(),
    ).toBe(401);
    await page
      .getByPlaceholder("000000", { exact: true })
      .fill(generateTOTPCode(secret));
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/today$/);
    expect((await page.request.get("/api/v1/me")).status()).toBe(200);
  } finally {
    await db.$disconnect();
  }
});
