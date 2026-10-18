import type { CoachData } from "@repo/coach";
import { db as defaultDb } from "@repo/db";
import { getMood, setMood as setMoodRow } from "./mood.ts";
import { appendJournal as appendJournalRow, getJournalDay, getJournalTemplate } from "./journal.ts";
import { listInboxDrafts as inboxRows } from "./drafts.ts";
import { fileDraft as fileDraftRow } from "./draft-filing/index.ts";
import { listHabits as habitRows } from "./habits.ts";
import type { Db } from "./db.ts";
import { addTask, completeTask as completeTaskRow, listForCoach, scheduleOn, updateOpenTask } from "./tasks.ts";
import { createNote as createNoteRow, listNotebooks as notebookRows } from "./notes.ts";

// Keep existing callers on the same interface; execution policy lives together.
export { coachTools, coachToolsContext, coachToolNames, freshRead, maxCreatesPerTurn } from "./coach-execution.ts";

// The Coach's data, through the same functions the screens use.
export function coachData(db: Db = defaultDb, today = ""): CoachData {
  return {
    async listHabits(userId, browserToday) {
      // The same daily and weekly habits the Habits page shows.
      const rows = await habitRows(userId, browserToday, [browserToday], db);
      return rows.map(({ id, name, period, trackMode, goalCount, bad, count, done, streak, record }) =>
        ({ id, name, period, trackMode, goalCount, bad, count, done, streak, record }));
    },
    getMood(userId, day) { return getMood(userId, day, db); },
    async readJournalDay(userId, day) {
      const entry = await getJournalDay(userId, day, db);
      const body = entry?.body ?? "";
      return { day, body: body.slice(0, 4_000), truncated: body.length > 4_000 };
    },
    getJournalTemplate(userId) { return getJournalTemplate(userId, db); },
    listInboxDrafts(userId) { return inboxRows(userId, db); },
    fileDraft(userId, input) { return fileDraftRow(userId, input, db); },
    setMood(userId, input) { return setMoodRow(userId, input, db); },
    appendJournal(userId, input) { return appendJournalRow(userId, input, db); },
    listNotebooks(userId) { return notebookRows(userId, db); },
    async createNote(userId, input, from) {
      const note = await createNoteRow(userId, input, from, db);
      if (note.notebookId !== input.notebookId) throw new Error("Invalid Note result.");
      return { id: note.id, notebookId: note.notebookId, title: note.title };
    },
    async listOpenTasks(userId) {
      return listForCoach(userId, today, db);
    },
    createTask(userId, input, from) {
      return addTask(userId, { ...input, from, today }, db);
    },
    completeTask(userId, taskId) {
      return completeTaskRow(userId, taskId, db);
    },
    scheduleTask(userId, taskId, date) {
      return scheduleOn(userId, taskId, date, today, db);
    },
    updateTask(userId, taskId, input) {
      return updateOpenTask(userId, taskId, input, db);
    },
  };
}
