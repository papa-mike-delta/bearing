// Tool definitions, skill files, and knowledge markdown.
// No model calls and no AI SDK. apps/web wraps the tools and owns the route.

export type { CoachData, ListedHabit, ListedTask, ToolRunContext } from "./data.ts";
export {
  coachSystemPrompt,
  maxCoachSteps,
  maxCreatesPerTurn,
} from "./prompt.ts";
export { receipt, shownParts, coachReadToolTypes, habitPeriodWords, type ShownPart } from "./receipts.ts";
export { completeTask } from "./tools/complete-task.ts";
export { createNote, listNotebooks, coachNoteSourceId } from "./tools/create-note.ts";
export { coachCreateSourceId, createTask } from "./tools/create-task.ts";
export { listArea, maxListedTasks } from "./tools/list-area.ts";
export { scheduleTask } from "./tools/schedule-task.ts";
export { updateTask } from "./tools/update-task.ts";

// The longest message a person can send the Coach, in UTF-16 code units (what
// an input's maxLength counts). Every saved message goes into later prompts.
export const maxCoachMessageLength = 4_000;

export { skills, type Skill } from "./skills.ts";
export { readSkill, habitDesignAllowedTools } from "./tools/read-skill.ts";

export { appendJournal, coachJournalOperationId } from "./tools/append-journal.ts";
export { setMood } from "./tools/set-mood.ts";
export { coachMoods } from "./moods.ts";

export { fileDraft, type FileDraftInput, type FiledDraft } from "./tools/file-draft.ts";
export { listInboxDrafts, maxListedInboxDrafts } from "./tools/list-inbox-drafts.ts";
export { CloseRefusal, closeRefusalPrefix } from "./close-refusal.ts";

export { listHabits } from "./tools/list-habits.ts";

export { createHabit, coachHabitOperationId } from "./tools/create-habit.ts";
export { trackHabit } from "./tools/track-habit.ts";
export type { HabitAction, HabitOperation, HabitWriteState, HabitTrackResult, HabitUndoRefusal } from "./data.ts";

export { coachWriteKey } from "./write-identity.ts";

export { logNoteOnPerson, listPeople, readPerson, setPersonLastConnected, setPersonAgreedDay } from "./tools/people.ts";
