import type { UIMessage } from "ai";

export const cancelsClose = (text: string) => /^(?:cancel|stop|end)(?:\s+(?:daily close|the close|close))?[.!?,;:\s]*$/i.test(text.trim());

// An explicit start can recover an abandoned close. Mentions in reflections
// keep the current session and selected day.
export const startsNewClose = (text: string) => /^(?:start\s+)?(?:daily close|close (?:the|my) day)(?:\s+(?:for\s+)?\d{4}-\d{2}-\d{2})?[.!?\s]*$/i.test(text.trim());

// Apply only messages sent/streamed in this view. Earlier completed closes
// must not hide a newly opened close for the same day.
export function closeDayOnScreen(day: string | null, messages: readonly UIMessage[], today: string) {
  for (const message of messages) {
    if (message.role === "user") {
      const text = message.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
      if (cancelsClose(text)) day = null;
      else if (startsNewClose(text)) day = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? day ?? today;
    } else if (message.role === "assistant" && message.parts.some((part) => {
      if (part.type !== "tool-finishDailyClose" || !("state" in part) || part.state !== "output-available") return false;
      const output = part.output as { finished?: boolean; day?: string } | undefined;
      return output?.finished === true && output.day === day;
    })) day = null;
  }
  return day;
}
