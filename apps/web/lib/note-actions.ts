import { NoteError, saveNote, type SaveNoteInput } from "./notes.ts";
import type { Db } from "./db.ts";

// Inject the Next request boundary so the action runs against real Postgres in tests.
export function noteActions(ports: {
  requireUser: () => Promise<{ id: string }>;
  invalidate: (path: string) => void;
  db: Db;
}) {
  return {
    async save(id: string, input: SaveNoteInput): Promise<{ revision: number; title: string; occasionDate: string | null } | { error: string }> {
      const user = await ports.requireUser();
      try {
        const note = await saveNote(user.id, id, input, ports.db);
        ports.invalidate("/notes");
        return { revision: note.revision, title: note.title, occasionDate: note.occasionDate };
      } catch (error) {
        return { error: error instanceof NoteError ? error.message : "Could not save. Your text is kept here; please try again." };
      }
    },
  };
}
