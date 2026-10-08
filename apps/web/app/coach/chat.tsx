"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useState } from "react";

export function Chat({
  threadId,
  initialMessages,
}: {
  threadId: string;
  initialMessages: UIMessage[];
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    id: threadId,
    messages: initialMessages,
    generateId: () => crypto.randomUUID(),
    transport: new DefaultChatTransport({
      api: "/api/coach",
      // Only the newest message; the server loads the rest of the thread.
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: { threadId: id, message: messages.at(-1) },
      }),
    }),
  });
  const replying = status === "submitted" || status === "streaming";
  // A reply that failed before any text has nothing to show.
  const shown = messages.filter((m) => m.parts.some((p) => p.type === "text"));

  return (
    <>
      {shown.length === 0 ? (
        <p>No messages yet.</p>
      ) : (
        <ol className="thread">
          {shown.map((message) => (
            <li key={message.id}>
              <small>{message.role === "user" ? "You" : "Coach"}</small>
              {message.parts.map((part, i) =>
                part.type === "text" ? <p key={i}>{part.text}</p> : null,
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
