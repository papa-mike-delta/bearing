import { z } from "zod";
import { isCalendarDay } from "./areas.ts";
import { maxTaskNameLength } from "./task.ts";
import { maxNoteNameLength } from "./note.ts";

// Shared filing contract; Coach supplies browser Today and adds linked receipts.
const journalDaySchema = z.union([
  z.literal("today"),
  z.string().refine(isCalendarDay, "Use a real YYYY-MM-DD calendar day."),
]).optional();

const destinationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("task"), name: z.string().trim().min(1).max(maxTaskNameLength).optional() }),
  z.strictObject({ kind: z.literal("note"), notebook: z.string().trim().min(1).max(maxNoteNameLength).optional(), notebookId: z.uuid().optional() })
    // Name and id together (as listNotebooks returns them) are accepted when they agree.
    .refine((input) => Boolean(input.notebook) || Boolean(input.notebookId), "Choose a Notebook name or id."),
  z.strictObject({ kind: z.literal("journal"), day: journalDaySchema }),
]);
export const fileDraftInputSchema = z.strictObject({ draftId: z.uuid(), destination: destinationSchema });
export type FileDraftInput = z.infer<typeof fileDraftInputSchema>;
export type FiledDraft =
  | { kind: "task"; id: string; name: string }
  | { kind: "note"; id: string; name: string; notebookId: string }
  | { kind: "journal"; id: string; day: string };
