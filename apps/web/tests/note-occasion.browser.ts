// Use a local app connected to TEST_POSTGRES_URL, never a live account.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { chromium } from "playwright-core";
import { createDb, users, sessions } from "@repo/db";
import { eq } from "drizzle-orm";
import { createNotebook, createNote, getNote } from "../lib/notes.ts";

const base = process.env.NOTE_TEST_BASE_URL;
const url = process.env.TEST_POSTGRES_URL;
test("Note occasion date waits for Save, shares the leave guard, persists, clears and refuses future on mobile", { skip: !base || !url, timeout: 120_000 }, async () => {
  const db = createDb(url!);
  const id = randomUUID(), token = randomUUID();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox"] });
  try {
    await db.insert(users).values({ id, email: `${id}@test.invalid`, passwordHash: "-" });
    await db.insert(sessions).values({ sessionToken: token, userId: id, expires: new Date(Date.now() + 3600_000) });
    const book = await createNotebook(id, "Memories", db);
    const note = await createNote(id, { notebookId: book.id, title: "Memory", body: "Original" }, { source: "coach", sourceId: randomUUID() }, db);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Pacific/Honolulu" });
    await context.addCookies([{ name: "authjs.session-token", value: token, url: base!, httpOnly: true }]);
    const page = await context.newPage();
    await page.goto(`${base}/notes/${book.id}/${note.id}`);
    const day = page.getByLabel("Occasion date (optional)");
    await day.waitFor();
    await page.waitForFunction(() => !!document.querySelector<HTMLInputElement>('input[type="date"]')?.max);
    const today = await day.getAttribute("max");
    assert.ok(today);
    const browserToday = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    });
    assert.equal(today, browserToday);
    const size = await day.evaluate(el => ({ font: getComputedStyle(el).fontSize, height: el.getBoundingClientRect().height }));
    assert.equal(size.font, "16px");
    assert.ok(size.height >= 40);
    await day.fill("2024-02-29");
    await page.getByRole("status").filter({ hasText: "Unsaved changes" }).waitFor();
    assert.equal((await getNote(id, note.id, db))!.occasionDate, null);
    const dialog = page.waitForEvent("dialog");
    const navigation = page.getByRole("link", { name: "Memories", exact: true }).click();
    await (await dialog).dismiss();
    await navigation;
    assert.equal(await day.inputValue(), "2024-02-29");
    await page.getByRole("button", { name: "Save Note", exact: true }).click();
    await page.getByRole("status").filter({ hasText: /^Saved$/ }).waitFor();
    assert.equal((await getNote(id, note.id, db))!.occasionDate, "2024-02-29");
    await page.reload();
    assert.equal(await day.inputValue(), "2024-02-29");
    const future = new Date(`${today}T12:00:00Z`);
    future.setUTCDate(future.getUTCDate()+1);
    await day.fill(future.toISOString().slice(0,10));
    await page.getByLabel("Title", { exact: true }).fill("Refused title");
    await page.getByRole("button", { name: "Save Note", exact: true }).click();
    assert.equal(await day.evaluate((el: HTMLInputElement) => el.validity.rangeOverflow), true);
    assert.equal((await getNote(id, note.id, db))!.title, "Memory");
    await day.fill(today);
    await page.getByRole("button", { name: "Save Note", exact: true }).click();
    await page.getByRole("status").filter({ hasText: /^Saved$/ }).waitFor();
    assert.equal((await getNote(id, note.id, db))!.occasionDate, today);
    await day.fill("");
    await page.getByRole("button", { name: "Save Note", exact: true }).click();
    await page.getByRole("status").filter({ hasText: /^Saved$/ }).waitFor();
    assert.equal((await getNote(id, note.id, db))!.occasionDate, null);
  } finally {
    await browser.close();
    await db.delete(users).where(eq(users.id, id));
    await db.$client.end();
  }
});

test("Note editor at 393: 44px buttons on the 20px left edge, in-page future-day error and a Clear control", { skip: !base || !url, timeout: 120_000 }, async () => {
  const db = createDb(url!);
  const id = randomUUID(), token = randomUUID();
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox"] });
  try {
    await db.insert(users).values({ id, email: `${id}@test.invalid`, passwordHash: "-" });
    await db.insert(sessions).values({ sessionToken: token, userId: id, expires: new Date(Date.now() + 3600_000) });
    const book = await createNotebook(id, "Memories", db);
    const note = await createNote(id, { notebookId: book.id, title: "Memory", body: "Original" }, { source: "coach", sourceId: randomUUID() }, db);
    const context = await browser.newContext({ viewport: { width: 393, height: 852 } });
    await context.addCookies([{ name: "authjs.session-token", value: token, url: base!, httpOnly: true }]);
    const page = await context.newPage();
    await page.goto(`${base}/notes/${book.id}/${note.id}`);
    const day = page.getByLabel("Occasion date (optional)");
    await day.waitFor();
    await page.waitForFunction(() => !!document.querySelector<HTMLInputElement>('input[type="date"]')?.max);
    const box = async (name: string) => (await page.getByRole("button", { name, exact: true }).boundingBox())!;
    const save = await box("Save Note"), preview = await box("Preview");
    assert.ok(save.height >= 44, `Save Note ${save.height}`);
    assert.ok(preview.height >= 44, `Preview ${preview.height}`);
    const title = (await page.getByLabel("Title", { exact: true }).boundingBox())!;
    assert.ok(Math.abs(save.x - title.x) <= 1, `Save Note x ${save.x} vs input x ${title.x}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const today = (await day.getAttribute("max"))!;
    const future = new Date(`${today}T12:00:00Z`);
    future.setUTCDate(future.getUTCDate() + 1);
    await day.fill(future.toISOString().slice(0, 10));
    await page.getByText("The occasion date must be today or a past day.").waitFor();
    assert.equal(await day.getAttribute("aria-invalid"), "true");
    await page.getByRole("button", { name: "Clear occasion date" }).click();
    assert.equal(await day.inputValue(), "");
    assert.equal(await page.getByText("The occasion date must be today or a past day.").count(), 0);
  } finally {
    await browser.close();
    await db.delete(users).where(eq(users.id, id));
    await db.$client.end();
  }
});
