import { expect, test } from "./fixtures";

test("a health suggestion rejects with no Link and accepts one receipt", async ({
  page,
}) => {
  const created = await (
    await page.request.post("/api/v1/items", {
      data: {
        type: "note",
        title: "Medication log",
        content: "Take with food.",
      },
    })
  ).json();
  expect(created.value.id).toBeTruthy();
  await page.goto(`/app/library/${created.value.id}`);
  await expect(
    page.getByRole("button", {
      name: "Reject link to Me for Medication log",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Suggestion only.")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Reject link to Me for Medication log",
      exact: true,
    })
    .click();
  await expect(page.getByText("Rejected. Nothing was written.")).toBeVisible();
  const before = await (await page.request.get("/api/v1/links")).json();
  expect(
    before.some(
      (link: { fromId: string }) => link.fromId === created.value.id,
    ),
  ).toBe(false);
  await page.reload();
  await page
    .getByRole("button", {
      name: "Accept link to Me for Medication log",
      exact: true,
    })
    .click();
  const receipt = page.getByRole("status").filter({ hasText: "Saved. Receipt" });
  await expect(receipt).toBeVisible();
  const receiptText = await receipt.innerText();
  const receiptId = receiptText.match(/Receipt (\S+)\./)?.[1];
  expect(receiptId).toBeTruthy();
  const links = await (await page.request.get("/api/v1/links")).json();
  expect(
    links.filter(
      (link: { fromId: string; type: string }) =>
        link.fromId === created.value.id && link.type === "related_to",
    ),
  ).toHaveLength(1);
  const audit = await (
    await page.request.get(`/api/receipts/${receiptId}`)
  ).json();
  expect(audit.status).toBe("success");
  expect(audit.operation).toBe("v1.link.create");
  const note = (
    await (await page.request.get(`/api/v1/items/${created.value.id}`)).json()
  );
  const me = await (await page.request.get("/api/v1/me")).json();
  const replay = await page.request.post("/api/v1/links", {
    data: {
      fromId: note.id,
      toId: me.id,
      type: "related_to",
      fromRevision: note.revision,
      toRevision: me.revision,
    },
  });
  expect(replay.ok()).toBeTruthy();
  expect((await replay.json()).receiptId).toBe(receiptId);
  expect(
    (
      await (await page.request.get("/api/v1/links")).json()
    ).filter(
      (link: { fromId: string; type: string }) =>
        link.fromId === created.value.id && link.type === "related_to",
    ),
  ).toHaveLength(1);
});

test("Journal text can propose a mention, while a checked Person is saved immediately", async ({
  page,
}) => {
  const identity = await (await page.request.get("/api/v1/identity")).json();
  const person = await (
    await page.request.post("/api/v1/items", {
      data: { type: "person", title: "Alex Rivera" },
    })
  ).json();
  const named = await page.request.post("/api/v1/capture", {
    headers: { "X-Bearing-Account": identity.userId },
    data: {
      clientId: `named-${Date.now()}`,
      text: "Saw Alex Rivera today",
      capturedAt: "2026-11-06T15:00:00.000Z",
      occurredAt: "2026-11-06T15:00:00.000Z",
      timezone: "America/New_York",
    },
  });
  expect(named.ok()).toBeTruthy();
  await page.goto("/app/journal?date=2026-11-06");
  await page
    .getByRole("button", {
      name: "Reject journal mention of Alex Rivera",
      exact: true,
    })
    .click();
  await expect(page.getByText("Rejected. Nothing was written.")).toBeVisible();
  const moments = await (await page.request.get("/api/v1/journal")).json();
  const namedMoment = moments.find((moment: { text: string }) =>
    moment.text.includes("Alex Rivera"),
  );
  expect(namedMoment.items).toEqual([]);
  await page.reload();
  await page
    .getByRole("button", {
      name: "Accept journal mention of Alex Rivera",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved. Receipt" }),
  ).toBeVisible();
  const mentioned = await (await page.request.get("/api/v1/journal")).json();
  expect(
    mentioned
      .find((moment: { id: string }) => moment.id === namedMoment.id)
      .items.some(
        (item: { relation: string; itemId: string }) =>
          item.relation === "mention" && item.itemId === person.value.id,
      ),
  ).toBe(true);
  const checked = await page.request.post("/api/v1/capture", {
    headers: { "X-Bearing-Account": identity.userId },
    data: {
      clientId: `checked-${Date.now()}`,
      text: "Checked Alex Rivera",
      capturedAt: "2026-11-06T16:00:00.000Z",
      occurredAt: "2026-11-06T16:00:00.000Z",
      timezone: "America/New_York",
      mentionIds: [person.value.id],
    },
  });
  expect(checked.ok()).toBeTruthy();
  expect((await checked.json()).value.items).toEqual([
    expect.objectContaining({
      itemId: person.value.id,
      relation: "mention",
    }),
  ]);
});

test("a location capture proposes that the entry was at the Place", async ({
  page,
}) => {
  const identity = await (await page.request.get("/api/v1/identity")).json();
  const captured = await page.request.post("/api/v1/capture", {
    headers: { "X-Bearing-Account": identity.userId },
    data: {
      clientId: `place-${Date.now()}`,
      text: "Corner cafe",
      capturedAt: "2026-11-06T17:00:00.000Z",
      occurredAt: "2026-11-06T17:00:00.000Z",
      timezone: "America/New_York",
      place: { latitude: 40.71, longitude: -74 },
    },
  });
  expect(captured.ok()).toBeTruthy();
  await page.goto("/app/journal?date=2026-11-06");
  await expect(page.getByText("does not place Me")).toBeVisible();
  await page
    .getByRole("button", { name: "Accept location for Corner cafe", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved. Receipt" }),
  ).toBeVisible();
  const moments = await (await page.request.get("/api/v1/journal")).json();
  const moment = moments.find((entry: { text: string }) =>
    entry.text.includes("Corner cafe"),
  );
  expect(
    moment.items.some(
      (item: { relation: string }) => item.relation === "located_at",
    ),
  ).toBe(true);
  const links = await (await page.request.get("/api/v1/links")).json();
  expect(
    links.some((link: { type: string }) => link.type === "located_at"),
  ).toBe(false);
});
