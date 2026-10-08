import {
  coachSystemPrompt,
  maxCoachMessageLength,
  maxCoachSteps,
} from "@repo/coach";
import { db as defaultDb } from "@repo/db";
import {
  convertToModelMessages,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type LanguageModel,
  type TextStreamPart,
  type ToolSet,
  type UIMessage,
} from "ai";
import { saveMessage, threadMessages } from "./coach-threads.ts";
import { coachData, coachTools, coachToolsContext } from "./coach-tools.ts";
import { isUuid, type Db } from "./db.ts";

// The Gateway model id. Swap models by changing COACH_MODEL.
export function coachModel() {
  return process.env.COACH_MODEL || "anthropic/claude-haiku-5.5";
}

// The Gateway tries this when the main model fails. Bearing has no retry code.
export const fallbackModel = "openai/gpt-6-luna";

// The model sees only the most recent messages of the thread (20 exchanges),
// and each model step of a reply is capped. At 4,000 characters a message,
// the messages bound a turn's prompt at roughly 40k tokens, plus what tool
// calls returned (listArea lists at most 50 Tasks). The whole thread is still
// saved and shown.
export const historyWindow = 40;
export const maxReplyTokens = 1_000;

// The text of a well-formed new message: a user message with a uuid id and
// exactly one non-blank text part within the length limit. Anything else is
// null.
function newMessageText(message: unknown) {
  const m = message as Partial<UIMessage> | null;
  if (!isUuid(m?.id) || m.role !== "user") return null;
  if (!Array.isArray(m.parts) || m.parts.length !== 1) return null;
  const [part] = m.parts as { type?: unknown; text?: unknown }[];
  if (part?.type !== "text" || typeof part.text !== "string") return null;
  const { text } = part;
  if (!text.trim() || text.length > maxCoachMessageLength) return null;
  return { id: m.id, text };
}

// One Coach turn: the person's newest message in, the reply streamed out.
// The route passes the session user; tests pass a scripted model and their
// own database. Refuses, writing nothing:
// - 400: a message that isn't a user message with a uuid id and one
//   non-blank text part of at most maxCoachMessageLength, or a thread whose
//   saved tool calls don't fit the tools;
// - 404: a thread that isn't the user's;
// - 409: an id already used by another thread or role, or by an earlier
//   message (only the last message can be resent).
// The message is rebuilt from its text alone, so nothing else the client
// sends is stored or reaches the model. The Coach's tools act for `userId`
// only, and a turn stops after maxCoachSteps model steps. The message is
// saved before the model runs and the reply when it finishes, so a closed
// tab doesn't lose the turn: `saved` settles once both are written. Stopping
// in the browser doesn't stop the model; the reply still finishes and is
// saved.
export async function coachTurn({
  userId,
  threadId,
  message,
  model,
  db = defaultDb,
}: {
  userId: string;
  threadId: unknown;
  message: unknown;
  model: LanguageModel;
  db?: Db;
}) {
  const incoming = newMessageText(message);
  if (!incoming) return { refused: 400 } as const;
  const earlier = await threadMessages(userId, threadId, db);
  if (!earlier) return { refused: 404 } as const;
  // A resend after a failed turn repeats the last message; answer it again.
  const resent = earlier.findIndex((m) => m.id === incoming.id);
  if (resent !== -1 && resent !== earlier.length - 1) {
    return { refused: 409 } as const;
  }
  const userMessage: UIMessage = {
    id: incoming.id,
    role: "user",
    parts: [{ type: "text", text: incoming.text }],
  };
  const tools = coachTools(coachData(db));
  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({
      messages: [
        ...(resent === -1 ? earlier : earlier.slice(0, -1)),
        userMessage,
      ],
      tools,
    });
  } catch {
    return { refused: 400 } as const;
  }
  const thread = threadId as string;
  if (!(await saveMessage(userId, thread, userMessage, db))) {
    return { refused: 409 } as const;
  }

  // Start the model's view at a user message.
  const recent = messages.slice(-historyWindow);
  while (recent[0]?.role !== "user") recent.shift();
  const result = streamText({
    model,
    system: coachSystemPrompt,
    messages: await convertToModelMessages(recent, { tools }),
    tools,
    toolsContext: coachToolsContext(userId),
    stopWhen: isStepCount(maxCoachSteps),
    maxOutputTokens: maxReplyTokens,
    providerOptions: {
      gateway: { models: [fallbackModel], user: userId, tags: ["coach"] },
    },
  });
  // A model or Gateway error, even after some text, means the reply isn't
  // saved; the person resends instead. (The stream can still report
  // "completed" after an error part, so the outcome alone isn't enough.) A
  // failed tool call isn't one: the model sees the error and goes on, and the
  // reply is saved with a refused receipt.
  let failed = false;
  // One copy streams to the browser, the other is read here, so the reply is
  // still saved if the browser stops reading. Reasoning isn't sent or saved.
  const [stream, ownCopy] = toUIMessageStream({
    stream: result.stream.pipeThrough(failOnErrors(() => (failed = true))),
    tools,
    sendReasoning: false,
    originalMessages: messages,
    generateMessageId: () => crypto.randomUUID(),
    onEnd: async ({ responseMessage, outcome }) => {
      if (!failed && outcome.status === "completed") {
        await saveMessage(userId, thread, responseMessage, db, userMessage.id);
      }
    },
  }).tee();
  return { stream, saved: readToEnd(ownCopy) };
}

// Calls `fail` on an error part. Reasoning counts toward maxReplyTokens, so
// a reply can hit the cap before writing any text. That's a failed turn too
// (an error part is added, so it isn't saved and the browser offers Resend),
// not an empty reply the browser would hide.
function failOnErrors(fail: () => void) {
  let wroteText = false;
  return new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
    transform(part, controller) {
      if (part.type === "text-delta" && part.text.trim()) wroteText = true;
      if (
        part.type === "finish" &&
        part.finishReason === "length" &&
        !wroteText
      ) {
        fail();
        controller.enqueue({
          type: "error",
          error: new Error("The reply hit the token cap before any text"),
        });
      }
      if (part.type === "error") fail();
      controller.enqueue(part);
    },
  });
}

async function readToEnd(stream: ReadableStream) {
  const reader = stream.getReader();
  while (!(await reader.read()).done);
}
