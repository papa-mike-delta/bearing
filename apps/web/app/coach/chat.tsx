"use client";

import { useChat } from "@ai-sdk/react";
import { maxCoachMessageLength } from "@repo/coach";
import { APICallError, DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { shownThread } from "../../lib/coach-screen";

export function Chat({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: UIMessage[];
}) {
  const [input, setInput] = useState("");
  // User message ids whose reply was stopped in this view. Not saved: a
  // reload starts over from the stored thread, so the note is gone and the
  // full reply is there. Stop does not reload, and it does not cancel the
  // model's turn.
  const [stoppedUserIds, setStoppedUserIds] = useState<string[]>([]);
  const router = useRouter();
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
    transport: new DefaultChatTransport({
      api: "/api/coach",
      // Only the newest message; the server loads the rest of the thread.
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: { threadId: id, message: messages.at(-1) },
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
  const shown = shownThread(messages, stoppedUserIds);

  return (
    <>
      {shown.length === 0 ? (
        <p>No messages yet.</p>
      ) : (
        <ol className="thread">
          {shown.map((message) => (
            <li key={message.id}>
              <small>{message.role === "user" ? "You" : "Coach"}</small>
              {message.parts.map((part) =>
                "receipt" in part ? (
                  <p key={part.key} className="receipt" data-calls={part.calls}>
                    {part.href ? (
                      <Link href={part.href}>{part.receipt}</Link>
                    ) : (
                      part.receipt
                    )}
                  </p>
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
          <button type="button" onClick={() => regenerate()}>
            Resend
          </button>
        </p>
      ) : null}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim() || replying) return;
          following.current = true;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <input
          aria-label="Message the Coach"
          placeholder="Message the Coach"
          value={input}
          maxLength={maxCoachMessageLength}
          onChange={(event) => setInput(event.target.value)}
          disabled={replying}
        />
        {replying ? (
          <button
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
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
      <div ref={end} />
    </>
  );
}
