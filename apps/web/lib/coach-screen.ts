import { shownParts, type ShownPart } from "@repo/coach";

// Plain text, the same type as a reply. Not a receipt, and not stored:
// a reload renders the saved reply and this note is gone.
export const stoppedReplyMarker = "Stopped. The full reply was saved.";

type ThreadMessage = {
  id: string;
  role: string;
  parts: Parameters<typeof shownParts>[0];
};

export type ShownTurn = {
  id: string;
  role: string;
  parts: ShownPart[];
  marker?: typeof stoppedReplyMarker;
};

// The thread as the page shows it. `stoppedUserMessageIds` are turns the
// person stopped in this view. Each of those replies carries a note that
// the full reply was saved, including when Stop landed before any text
// (no Coach bubble yet, or only the list receipt). The note is not a
// message part, so a reload — an empty list, the thread as stored — shows
// the saved reply and its receipt and nothing else. A message sent after
// Stop stays after that turn.
export function shownThread(
  messages: readonly ThreadMessage[],
  stoppedUserMessageIds: readonly string[],
): ShownTurn[] {
  const stopped = new Set(stoppedUserMessageIds);
  const turns: ShownTurn[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    const parts = shownParts(message.parts);
    const stoppedReply = isStoppedReply(messages, i, stopped);
    if (parts.length || stoppedReply) {
      turns.push({
        id: message.id,
        role: message.role,
        parts,
        ...(stoppedReply && { marker: stoppedReplyMarker }),
      });
    }
    // Stop before the reply was on screen at all: admit it anyway, in
    // that turn's place, so a later message can't land ahead of it.
    if (
      message.role === "user" &&
      stopped.has(message.id) &&
      !replyOnScreen(messages, i)
    ) {
      turns.push({
        id: `stopped:${message.id}`,
        role: "assistant",
        parts: [],
        marker: stoppedReplyMarker,
      });
    }
  }
  return turns;
}

// The assistant message for this user message, if one is already in the
// thread. The next user message starts another turn.
function replyOnScreen(messages: readonly ThreadMessage[], userIndex: number) {
  for (let i = userIndex + 1; i < messages.length; i++) {
    const message = messages[i]!;
    if (message.role === "user") return false;
    if (message.role === "assistant") return true;
  }
  return false;
}

function isStoppedReply(
  messages: readonly ThreadMessage[],
  index: number,
  stopped: ReadonlySet<string>,
) {
  const message = messages[index]!;
  if (message.role !== "assistant") return false;
  for (let i = index - 1; i >= 0; i--) {
    const earlier = messages[i]!;
    if (earlier.role === "assistant") continue;
    return earlier.role === "user" && stopped.has(earlier.id);
  }
  return false;
}
