// A Draft is text in the Inbox until it is filed.

// Filing as a task: the first non-empty line is the name, the rest is the
// note. Null when the text has no non-empty line.
export function draftToTask(
  body: string,
): { name: string; note: string } | null {
  const lines = body.split(/\r?\n/);
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first === -1) return null;
  const note = lines
    .slice(first + 1)
    .join("\n")
    .replace(/^\s*\n/, "")
    .trimEnd();
  return { name: lines[first]!.trim(), note };
}
