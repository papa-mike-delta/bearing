// What the Coach's tools need from Bearing's data, injected by the web app so
// this package needs no database, no AI SDK and no key. Every call takes the
// session user's id; a tool never gets a user id from the model.

import type { FileDraftInput, FiledDraft } from "./tools/file-draft.ts";
import type { CoachMood } from "./moods.ts";

export type ListedTask = {
  id: string;
  name: string;
  priority: number;
  area: string;
  isNext: boolean;
};

export type CoachData = {
  readJournalDay?(userId: string, day: string): Promise<{ day: string; body: string; truncated: boolean }>;
  getJournalTemplate?(userId: string): Promise<{ template: string }>;
  listInboxDrafts?(userId: string): Promise<{ id: string; excerpt: string; createdAt: string }[]>;
  fileDraft?(userId: string, input: FileDraftInput & { today: string }): Promise<FiledDraft>;
  setMood?(
    userId: string,
    input: {
      day: string;
      today: string;
      mood: CoachMood | null;
      setAt: number;
    },
  ): Promise<{ day: string; mood: CoachMood | null }>;
  appendJournal?(
    userId: string,
    input: {
      day: string;
      today: string;
      text: string;
      source: "coach";
      operationId: string;
    },
  ): Promise<{ id: string; day: string }>;
  listNotebooks?(userId: string): Promise<{ id: string; name: string }[]>;
  createNote?(
    userId: string,
    input: { notebookId: string; title: string; body: string },
    from: { source: "coach"; sourceId: string },
  ): Promise<{ id: string; notebookId: string; title: string }>;
  // Open Tasks from every Area, hidden ones included, in Area order and then
  // that Area's order. isNext is the bold Next of that Task's own Area.
  listOpenTasks(userId: string): Promise<ListedTask[]>;
  // Null when the name, note, day, or Area is refused. `sourceId` is
  // resend-safe (message id + a hash of the name), so a retry of the same
  // add is the same Task. With one Area, `area` is ignored.
  createTask(
    userId: string,
    input: { name: string; note?: string; area?: string },
    from: { source: "coach"; sourceId: string },
  ): Promise<{ id: string; name: string } | null>;
  // Null when that id is not an open Task of this user.
  completeTask(
    userId: string,
    taskId: string,
  ): Promise<{ id: string; name: string } | null>;
  // Null when the Task isn't an open Task of this user, or the date isn't
  // strictly after today. Same rule as the date field.
  scheduleTask(
    userId: string,
    taskId: string,
    date: string,
  ): Promise<{ id: string; name: string } | null>;
  // Null when the Task isn't an open Task of this user, or a field is refused.
  // Omitted fields stay. `goal` null clears it. Area, workflow, and the date
  // are not here.
  updateTask(
    userId: string,
    taskId: string,
    input: {
      name?: string;
      note?: string;
      priority?: number;
      status?: "later" | "next" | "started" | "waiting" | "completed";
      goal?: string | null;
    },
  ): Promise<{ id: string; name: string } | null>;
};

// What a tool's handler runs with: the session user, the model's tool-call id,
// the person's message id (stable across resends), and the data.
export type ToolRunContext = {
  userId: string;
  toolCallId: string;
  messageId: string;
  today?: string;
  messageCreatedAt?: number;
  data: CoachData;
};
