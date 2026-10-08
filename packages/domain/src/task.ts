// The rule for a new task, wherever it comes from (the list or a Draft).

export const maxTaskNameLength = 500;
export const maxTaskNoteLength = 10_000;

// Trims the name. Null when the name is empty or either field is too long.
export function newTask(input: {
  name: string;
  note?: string;
}): { name: string; note: string } | null {
  const name = input.name.trim();
  const note = input.note ?? "";
  if (!name || name.length > maxTaskNameLength) return null;
  if (note.length > maxTaskNoteLength) return null;
  return { name, note };
}
