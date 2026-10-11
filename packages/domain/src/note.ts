export const maxNoteNameLength = 200;
export const maxNoteBodyLength = 100_000;

export function noteName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= maxNoteNameLength ? name : null;
}

export function validNoteBody(value: unknown): value is string {
  return typeof value === "string" && value.length <= maxNoteBodyLength;
}

export function draftNoteTitle(body: string): string {
  return body.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
}

export function noteHref(notebookId: string, noteId: string) {
  return `/notes/${notebookId}/${noteId}` as const;
}
