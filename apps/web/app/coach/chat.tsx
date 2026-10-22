"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { useChat } from "@ai-sdk/react";
import { maxCoachMessageLength } from "@repo/coach";
import { APICallError, DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { focusComposerOnMount, shownThread } from "../../lib/coach-screen";
import { closeDayOnScreen } from "../../lib/daily-close/state";
import { renderMarkdownPreview } from "../../lib/markdown";
import { localToday } from "../../lib/today";
import { useBrowserToday } from "../browser-today";

// Set when the person sends from this view. If a server resync remounts Chat,
// the new mount puts focus back in the composer.
let sentFromComposer = false;

export function Chat({
  threadId,
  initialMessages,
  initialCloseDay,
  openingClose,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  initialCloseDay: string | null;
  openingClose: boolean;
}) {
  const [input, setInput] = useState("");
  // User message ids whose reply was stopped in this view. Not saved: a
  // reload starts over from the stored thread, so the note is gone and the
  // full reply is there. Stop does not reload, and it does not cancel the
  // model's turn.
  const [stoppedUserIds, setStoppedUserIds] = useState<string[]>([]);
  const router = useRouter();
  // Only a newly opened close chooses a day. Otherwise let the server inherit
  // its stored mode, including completion while this view waits for refresh.
  const closeDay = useRef<string | undefined>(openingClose ? initialCloseDay ?? undefined : undefined);
  const composer = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focus = focusComposerOnMount({ sentFromComposer, openingClose });
    sentFromComposer = false;
    if (focus) composer.current?.focus({ preventScroll: true });
  }, [openingClose]);
  const send = (text: string) => {
    following.current = true;
    sentFromComposer = true;
    // Consume the entry link once a turn starts. Reload must use durable mode,
    // rather than reopening a finished close from a stale query parameter.
    if (openingClose) window.history.replaceState(null, "", "/coach");
    sendMessage({ text });
    composer.current?.focus({ preventScroll: true });
  };
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    id: threadId,
    messages: initialMessages,
    generateId: () => crypto.randomUUID(),
    // 409: the server's thread has moved on, e.g. a Resend after the
    // connection dropped but the reply was saved. Reload the thread from the
    // server; the page keys this component by its last message, so it starts
    // over with the saved thread and no error.
    onError: (error) => {
      if (APICallError.isInstance(error) && error.statusCode === 409) {
        router.refresh();
      }
    },
    onFinish: () => {
      window.dispatchEvent(new Event("people-changed"));
      closeDay.current = undefined;
      // Keep the streamed reply. Persistence runs independently on the server;
      // an immediate refresh could replace it with the not-yet-saved thread.
    },
    transport: new DefaultChatTransport({
      api: "/api/coach",
      // Only the newest message; the server loads the rest of the thread.
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: { threadId: id, message: messages.at(-1), today: localToday(), closeDay: closeDay.current },
      }),
    }),
  });
  const replying = status === "submitted" || status === "streaming";

  // Keep the newest message and the composer in view: on load, on send, and
  // as a reply streams in, unless the person has scrolled up to read.
  const end = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      const { scrollHeight } = document.documentElement;
      following.current =
        window.innerHeight + window.scrollY >= scrollHeight - 80;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (following.current) end.current?.scrollIntoView({ block: "end" });
  }, [messages, status, stoppedUserIds]);
  // Open at the newest message. The browser restores the old scroll position
  // on a reload, and Next scrolls to the top after a link, both after the
  // effect above; so restoration is off while the Coach is open, and the
  // first scroll waits a frame.
  useEffect(() => {
    const restoration = history.scrollRestoration;
    history.scrollRestoration = "manual";
    const frame = requestAnimationFrame(() =>
      end.current?.scrollIntoView({ block: "end" }),
    );
    return () => {
      cancelAnimationFrame(frame);
      history.scrollRestoration = restoration;
    };
  }, []);

  // A reply that failed before any text or tool call has nothing to show.
  // A stopped one still does: a neutral note. Stop ends the browser stream;
  // reload to see the reply if the Coach finished and saved it.
  // Receipts say "today" or "this week" against the viewer's current Today,
  // like the Habits page. It is null on the server and during hydration, so
  // the first render shows the absolute date and the two renders match.
  const browserToday = useBrowserToday();
  const shown = shownThread(messages, stoppedUserIds, browserToday);
  const visibleCloseDay = closeDayOnScreen(initialCloseDay, messages.slice(initialMessages.length), localToday());

  return (
    <>
      {visibleCloseDay && <section aria-label="Daily close" className="mb-6 flex flex-wrap items-center gap-3">
        <p>Daily close · {visibleCloseDay}. Skip any question or cancel.</p>
        {openingClose && messages.length === initialMessages.length && <Button type="button" disabled={replying} onClick={() => send("Start Daily close")}>Start Daily close</Button>}
        <Button type="button" variant="outline" disabled={replying} onClick={() => send("Cancel Daily close")}>Cancel Daily close</Button>
      </section>}
      {shown.length === 0 ? (
        <p>No messages yet.</p>
      ) : (
        <ol className="thread">
          {shown.map((message) => (
            <li key={message.id}>
              <small>{message.role === "user" ? "You" : "Coach"}</small>
              {message.parts.map((part) =>
                "receipt" in part ? (
                  <p key={part.key} className={part.read ? "receipt receipt-read" : "receipt"} data-calls={part.calls}>
                    {part.href ? (
                      <Link href={part.href}>{part.receipt}</Link>
                    ) : (
                      part.receipt
                    )}
                  </p>
                ) : message.role === "assistant" ? (
                  <div key={part.key} className="markdown-preview coach-reply">{renderMarkdownPreview(part.text).content}</div>
                ) : (
                  <p key={part.key}>{part.text}</p>
                ),
              )}
              {message.marker ? (
                <p className="receipt" role="status">
                  {message.marker}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {error ? (
        <p role="alert">
          The Coach couldn&apos;t answer.{" "}
          <Button type="button" variant="outline" onClick={() => regenerate()}>
            Resend
          </Button>
        </p>
      ) : null}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() || replying) return;
          send(input);
          setInput("");
        }}
      >
        <Input
          ref={composer}
          className="w-auto"
          aria-label="Message the Coach"
          placeholder="Message the Coach"
          value={input}
          maxLength={maxCoachMessageLength}
          onChange={(event) => setInput(event.target.value)}
          // Read-only, not disabled, while replying: a disabled input drops
          // focus to the page top.
          readOnly={replying}
          aria-busy={replying}
        />
        {replying ? (
          <Button
            type="button"
            onClick={() => {
              const userId = [...messages]
                .reverse()
                .find((message) => message.role === "user")?.id;
              if (userId) {
                setStoppedUserIds((ids) =>
                  ids.includes(userId) ? ids : [...ids, userId],
                );
              }
              void stop();
            }}
          >
            Stop
          </Button>
        ) : (
          <Button type="submit">Send</Button>
        )}
      </form>
      <div ref={end} />
    </>
  );
}
