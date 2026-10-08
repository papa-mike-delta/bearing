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

type Part = ToolPart & { toolCallId?: string; text?: string };

export type ShownPart =
  | { key: string; text: string }
  | { key: string; receipt: string; calls: number };

// What a message shows: its text and its receipts, in order. A finished
// listArea read with the same result as the receipt just lastShown it (nothing
// shown in between) adds no line of its own, so a reply that read the list
// twice shows it once; `calls` counts the reads behind each receipt. A
// receipt keeps the tool-call id of its first read as its key.
export function shownParts(parts: readonly Part[]): ShownPart[] {
  const shown: ShownPart[] = [];
  let lastPart: Part | undefined; // the last part shown as a receipt
  parts.forEach((part, i) => {
    if (part.type === "text") {
      shown.push({ key: `text-${i}`, text: part.text ?? "" });
      return;
    }
    const line = receipt(part);
    if (!line) return;
    const lastShown = shown.at(-1);
    const repeat =
      lastPart?.type === part.type &&
      lastPart.state === "output-available" &&
      part.state === "output-available" &&
      JSON.stringify(lastPart.output) === JSON.stringify(part.output);
    if (repeat && lastShown && "calls" in lastShown) lastShown.calls += 1;
    else {
      const key = part.toolCallId ?? `part-${i}`;
      shown.push({ key, receipt: line, calls: 1 });
    }
    lastPart = part;
  });
  return shown;
}
