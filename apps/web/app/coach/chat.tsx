"use client";

import { useChat } from "@ai-sdk/react";
import { maxCoachMessageLength, shownParts } from "@repo/coach";
import { APICallError, DefaultChatTransport, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function Chat({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: UIMessage[];
}) {
  const [input, setInput] = useState("");
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
  // A reply that failed before any text or tool call has nothing to show.
  const shown = messages.flatMap((message) => {
    const parts = shownParts(message.parts);
    return parts.length ? [{ ...message, parts }] : [];
  });

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
                    {part.receipt}
                  </p>
                ) : (
                  <p key={part.key}>{part.text}</p>
                ),
              )}
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
          <button type="button" onClick={() => stop()}>
            Stop
          </button>
        ) : (
          <button type="submit">Send</button>
        )}
      </form>
    </>
  );
}
