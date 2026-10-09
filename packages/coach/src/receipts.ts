// The one line a tool call shows as in the Coach thread. Takes a stored or
// streamed tool part; null for parts that aren't a Coach tool call.

type ToolPart = { type: string; state?: string; output?: unknown };

const pending = (state: string | undefined) =>
  state === "input-streaming" || state === "input-available";

function nameOf(output: unknown): string | undefined {
  if (typeof output !== "object" || output === null) return undefined;
  const name = (output as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

function flag(output: unknown, key: "notFound" | "invalidId" | "refused") {
  if (typeof output !== "object" || output === null) return false;
  return (output as Record<string, unknown>)[key] === true;
}

type Line = { line: string; href?: "/" };

// `href` is set only when a create succeeded (a completed Task is off /).
function show(part: ToolPart): Line | null {
  if (part.type === "tool-listArea") {
    if (pending(part.state)) return { line: "Reading your list…" };
    const open = (part.output as { open?: unknown } | undefined)?.open;
    if (part.state === "output-available" && typeof open === "number") {
      return { line: `Read your list (${open} open)` };
    }
    return { line: "Couldn't read your list" };
  }
  if (part.type === "tool-createTask") {
    if (pending(part.state)) return { line: "Creating a task…" };
    const name = nameOf(part.output);
    if (part.state === "output-available" && name !== undefined) {
      return { line: `Created task '${name}'`, href: "/" };
    }
    return { line: "Couldn't create that task" };
  }
  if (part.type === "tool-completeTask") {
    if (pending(part.state)) return { line: "Completing…" };
    const name = nameOf(part.output);
    if (part.state === "output-available" && name !== undefined) {
      return { line: `Completed '${name}'` };
    }
    if (part.state === "output-available" && flag(part.output, "invalidId")) {
      return { line: "That Task id isn't valid" };
    }
    if (part.state === "output-available" && flag(part.output, "notFound")) {
      return { line: "Couldn't find that task" };
    }
    return { line: "Couldn't complete that task" };
  }
  return null;
}

export function receipt(part: ToolPart): string | null {
  return show(part)?.line ?? null;
}

type Part = ToolPart & { toolCallId?: string; text?: string };

export type ShownPart =
  | { key: string; text: string }
  | { key: string; receipt: string; calls: number; href?: "/" };

// What a message shows: its text and its receipts, in order. A finished
// listArea read with the same result as the receipt just before it (nothing
// shown in between) adds no line of its own, so a reply that read the list
// twice shows it once; `calls` counts the reads behind each receipt. A write
// stays its own line even when the next write looks the same. A receipt keeps
// the tool-call id of its first call as its key. A successful create links to
// the Priority List; a complete does not (the Task has left the list).
export function shownParts(parts: readonly Part[]): ShownPart[] {
  const shown: ShownPart[] = [];
  let lastPart: Part | undefined;
  parts.forEach((part, i) => {
    if (part.type === "text") {
      shown.push({ key: `text-${i}`, text: part.text ?? "" });
      return;
    }
    const line = show(part);
    if (!line) return;
    const lastShown = shown.at(-1);
    const repeat =
      part.type === "tool-listArea" &&
      lastPart?.type === part.type &&
      lastPart.state === "output-available" &&
      part.state === "output-available" &&
      JSON.stringify(lastPart.output) === JSON.stringify(part.output);
    if (repeat && lastShown && "calls" in lastShown) lastShown.calls += 1;
    else {
      const key = part.toolCallId ?? `part-${i}`;
      shown.push({
        key,
        receipt: line.line,
        calls: 1,
        ...(line.href && { href: line.href }),
      });
    }
    lastPart = part;
  });
  return shown;
}
