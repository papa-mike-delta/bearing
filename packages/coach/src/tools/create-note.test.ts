import assert from "node:assert/strict";
import { test } from "node:test";
import { noteHref } from "@repo/domain";
import type { CoachData } from "../data.ts";
import {
  coachNoteSourceId,
  createNote,
  listNotebooks,
} from "./create-note.ts";

const messageId = "11111111-1111-4111-8111-111111111111";
const notebookId = "22222222-2222-4222-8222-222222222222";

function fake(
  books: { id: string; name: string }[],
  result?: { id: string; notebookId: string; title: string },
) {
  const creates: {
    userId: string;
    input: { notebookId: string; title: string; body: string };
    from: { source: string; sourceId: string };
  }[] = [];
  const data: CoachData = {
    async getMood() {
      return null;
    },
    async listNotebooks() {
      return books;
    },
    async createNote(userId, input, from) {
      creates.push({ userId, input, from });
      return result ?? { id: "note-1", notebookId: input.notebookId, title: input.title };
    },
    async listOpenTasks() {
      return [];
    },
    async createTask() {
      throw new Error("createTask was not expected");
    },
    async completeTask() {
      throw new Error("completeTask was not expected");
    },
    async scheduleTask() {
      throw new Error("scheduleTask was not expected");
    },
    async updateTask() {
      throw new Error("updateTask was not expected");
    },
  };
  return { data, creates };
}

const ctx = (data: CoachData, userId = "user-7") => ({
  userId,
  toolCallId: "call_9",
  messageId,
  data,
});

test("createNote description matches ignoring case, not an exact name", () => {
  assert.ok(createNote.description.includes("ignoring case"));
  assert.equal(createNote.description.includes("exact"), false);
});

test("listNotebooks returns the person's notebooks", async () => {
  const books = [{ id: notebookId, name: "Ideas" }];
  const { data } = fake(books);
  assert.deepEqual(await listNotebooks.run({}, ctx(data)), {
    notebooks: books,
  });
});

test("createNote matches a Notebook name ignoring case and returns a Note link", async () => {
  const noteId = "33333333-3333-4333-8333-333333333333";
  const { data, creates } = fake(
    [{ id: notebookId, name: "Ideas" }],
    { id: noteId, notebookId, title: "Meeting" },
  );
  const result = await createNote.run(
    { notebook: "ideas", title: "Meeting", body: "Talked." },
    ctx(data),
  );
  assert.deepEqual(result, {
    id: noteId,
    notebookId,
    name: "Meeting",
    href: noteHref(notebookId, noteId),
  });
  assert.deepEqual(creates, [
    {
      userId: "user-7",
      input: { notebookId, title: "Meeting", body: "Talked." },
      from: {
        source: "coach",
        sourceId: coachNoteSourceId(messageId, notebookId, "Meeting"),
      },
    },
  ]);
});

test("createNote refuses an unknown or ambiguous Notebook and writes nothing", async () => {
  const missing = fake([{ id: notebookId, name: "Ideas" }]);
  assert.deepEqual(
    await createNote.run(
      { notebook: "Missing", title: "X", body: "" },
      ctx(missing.data),
    ),
    {
      refused: true,
      clarification:
        "Ask the person to choose one existing, unambiguous Notebook name.",
    },
  );
  assert.equal(missing.creates.length, 0);

  const clash = fake([
    { id: notebookId, name: "Ideas" },
    { id: "44444444-4444-4444-8444-444444444444", name: "ideas" },
  ]);
  assert.deepEqual(
    await createNote.run(
      { notebook: "Ideas", title: "X", body: "" },
      ctx(clash.data),
    ),
    {
      refused: true,
      clarification:
        "Ask the person to choose one existing, unambiguous Notebook name.",
    },
  );
  assert.equal(clash.creates.length, 0);
});
