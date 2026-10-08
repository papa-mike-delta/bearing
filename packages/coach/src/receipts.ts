// The one line a tool call shows as in the Coach thread. Takes a stored or
// streamed tool part; null for parts that aren't a Coach tool call.

type ToolPart = { type: string; state?: string; output?: unknown };

export function receipt(part: ToolPart): string | null {
  if (part.type !== "tool-listArea") return null;
  if (part.state === "input-streaming" || part.state === "input-available") {
    return "Reading your list…";
  }
  const open = (part.output as { open?: unknown } | undefined)?.open;
  if (part.state === "output-available" && typeof open === "number") {
    return `Read your list (${open} open)`;
  }
  return "Couldn't read your list";
}
