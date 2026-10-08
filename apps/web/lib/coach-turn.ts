import { coachSystemPrompt } from "@repo/coach";
import { db as defaultDb } from "@repo/db";
import {
  convertToModelMessages,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { saveMessage, threadMessages } from "./coach-threads.ts";
import { isUuid, type Db } from "./tasks.ts";

// The Gateway model id. Swap models by changing COACH_MODEL.
export function coachModel() {
  return process.env.COACH_MODEL || "spacexai/grok-4.7";
}

// The Gateway tries this when the main model fails. Bearing has no retry code.
export const fallbackModel = "openai/gpt-6-astra";

// One Coach turn: the person's newest message in, the reply streamed out.
// The route passes the session user; tests pass a scripted model and their
// own database. Refuses, writing nothing, a thread that isn't the user's
// (404), a message that isn't a user message with a uuid id (400), and an id
// already used by another thread (409). The user message is saved before the
// model runs and the reply when it finishes, so a closed tab doesn't lose the
// turn: `saved` settles once both are written.
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
  const candidate = message as Partial<UIMessage> | null;
  if (!isUuid(candidate?.id) || candidate.role !== "user") {
    return { refused: 400 } as const;
  }
  const earlier = await threadMessages(userId, threadId, db);
  if (!earlier) return { refused: 404 } as const;
  // A resend after a failed turn repeats the message; answer it again.
  const resent = earlier.findIndex((m) => m.id === candidate.id);
  const history = resent === -1 ? earlier : earlier.slice(0, resent);
  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: [...history, message] });
  } catch {
    return { refused: 400 } as const;
  }
  const thread = threadId as string;
  if (!(await saveMessage(userId, thread, messages.at(-1)!, db))) {
    return { refused: 409 } as const;
  }

  const result = streamText({
    model,
    system: coachSystemPrompt,
    messages: await convertToModelMessages(messages),
    providerOptions: {
      gateway: { models: [fallbackModel], user: userId, tags: ["coach"] },
    },
  });
  // One copy streams to the browser, the other is read here, so the reply is
  // still saved if the browser stops reading.
  const [stream, ownCopy] = toUIMessageStream({
    stream: result.stream,
    originalMessages: messages,
    generateMessageId: () => crypto.randomUUID(),
    onEnd: async ({ responseMessage, outcome }) => {
      // A failed reply isn't saved; the person resends instead.
      if (outcome.status === "completed") {
        await saveMessage(userId, thread, responseMessage, db);
      }
    },
  }).tee();
  return { stream, saved: readToEnd(ownCopy) };
}

async function readToEnd(stream: ReadableStream) {
  const reader = stream.getReader();
  while (!(await reader.read()).done);
}
