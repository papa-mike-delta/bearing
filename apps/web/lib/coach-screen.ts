import { shownParts, type ShownPart } from "@repo/coach";

// Plain text, the same type as a reply. Not a receipt, and not stored.
// The note is neutral: Stop ends the browser stream; reload to see the
// reply if the Coach finished and saved it. A reload drops the note.
export const stoppedReplyMarker =
  "Stopped. Reload to see the reply if the Coach finished it.";

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
// person stopped in this view. Each of those replies carries a neutral
// note: Stop ends the browser stream; reload to see the reply if the
// Coach finished and saved it, including when Stop landed before any text
// (no Coach bubble yet, or only the list receipt). The note is not a
// message part, so a reload — an empty list, the thread as stored — shows
// the reply and its receipt when the Coach finished and saved them, and
// nothing else. A message sent after Stop stays after that turn.
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

/** Whether a fresh Coach view should focus its composer: after a send from
 * the composer or a Daily close button (the reply's refresh remounts the
 * view), or when it opens a Daily close from the Journal. */
export function focusComposerOnMount({
  sentFromComposer,
  openingClose,
}: {
  sentFromComposer: boolean;
  openingClose: boolean;
}): boolean {
  return sentFromComposer || openingClose;
}
