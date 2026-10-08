import {
  type CoachData,
  coachSystemPrompt,
  listArea,
  maxCoachMessageLength,
  maxCoachSteps,
} from "@repo/coach";
import { db as defaultDb } from "@repo/db";
import {
  convertToModelMessages,
  isStepCount,
  pruneMessages,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type LanguageModel,
  type ModelMessage,
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
// the messages bound a turn's prompt at roughly 50k tokens (Haiku's
// tokenizer), plus this turn's read of the list (at most 50 Tasks). The whole
// thread is still saved and shown.
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
// only, and a turn stops after maxCoachSteps model steps. Every turn reads
// the list once before the model answers (see freshRead), and the model sees
// no tool output from earlier turns, so it answers from the list as it is
// now. The message is saved before the model runs and the reply when it
// finishes, so a closed tab doesn't lose the turn: `saved` settles once both
// are written. Stopping in the browser doesn't stop the model; the reply
// still finishes and is saved.
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
  const data = coachData(db);
  const tools = coachTools(data);
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
  // Read before saving, so a failed read writes nothing.
  const read = await freshRead(userId, data);
  if (!(await saveMessage(userId, thread, userMessage, db))) {
    return { refused: 409 } as const;
  }

  // Start the model's view at a user message.
  const recent = messages.slice(-historyWindow);
  while (recent[0]?.role !== "user") recent.shift();
  const history = pruneMessages({
    messages: await convertToModelMessages(recent, { tools }),
    toolCalls: "all",
  });
  const result = streamText({
    model,
    system: coachSystemPrompt,
    messages: [...history, ...read.messages],
    tools,
    toolsContext: coachToolsContext(userId),
    // The list was just read for the model. listArea stays defined, because
    // the prompt holds its call, but the model isn't offered it.
    toolChoice: "none",
    stopWhen: isStepCount(maxCoachSteps),
    maxOutputTokens: maxReplyTokens,
    // Thinking counts toward maxReplyTokens. Top level, so the fallback
    // model gets it too.
    reasoning: "low",
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
    stream: result.stream
      .pipeThrough(read.receipt)
      .pipeThrough(failOnErrors(() => (failed = true))),
    tools,
    sendReasoning: false,
    originalMessages: messages,
    generateMessageId: () => crypto.randomUUID(),
    onEnd: async ({ responseMessage, outcome, finishReason }) => {
      logTurn(thread, model, responseMessage, finishReason);
      if (!failed && outcome.status === "completed") {
        await saveMessage(userId, thread, responseMessage, db, userMessage.id);
      }
    },
  }).tee();
  return { stream, saved: readToEnd(ownCopy) };
}

// The person's open Tasks, read by Bearing at the start of a turn instead of
// waiting for the model to ask: so every answer is about the list as it is
// now, and a turn reads it once. `messages` hands the read to the model as a
// listArea call and its result. `receipt` adds the same call to the streamed
// reply, so it shows, saves and reloads as a listArea receipt.
async function freshRead(userId: string, data: CoachData) {
  const toolCallId = `read-${crypto.randomUUID()}`;
  const call = { toolCallId, toolName: "listArea" } as const;
  const output = await listArea.run({}, { userId, toolCallId, data });
  const messages: ModelMessage[] = [
    { role: "assistant", content: [{ type: "tool-call", ...call, input: {} }] },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          ...call,
          output: { type: "json", value: output },
        },
      ],
    },
  ];
  const receipt = new TransformStream<
    TextStreamPart<ToolSet>,
    TextStreamPart<ToolSet>
  >({
    transform(part, controller) {
      controller.enqueue(part);
      if (part.type !== "start") return;
      controller.enqueue({ type: "tool-call", ...call, input: {} });
      controller.enqueue({ type: "tool-result", ...call, input: {}, output });
    },
  });
  return { messages, receipt };
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

// One line per finished turn for the runtime logs: which model, how many
// steps and listArea calls, and how it ended. Nothing the person wrote, no
// tool output and no user id.
function logTurn(
  threadId: string,
  model: LanguageModel,
  reply: UIMessage,
  finishReason: string | undefined,
) {
  const count = (type: string) =>
    reply.parts.filter((part) => part.type === type).length;
  console.info(
    JSON.stringify({
      event: "coach.turn",
      threadId,
      model: typeof model === "string" ? model : model.modelId,
      steps: count("step-start"),
      toolCalls: { listArea: count("tool-listArea") },
      finishReason,
    }),
  );
}

async function readToEnd(stream: ReadableStream) {
  const reader = stream.getReader();
  while (!(await reader.read()).done);
}
