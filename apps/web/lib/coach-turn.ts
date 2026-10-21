import {
  type CoachData,
  CloseRefusal,
  receipt,
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
import { prepareCoachTurn } from "./daily-close/index.ts";
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
//   non-blank text part of at most maxCoachMessageLength;
// - 404: a thread that isn't the user's;
// - 409: an id already used by another thread or role, or by an earlier
//   message (only the last message can be resent), or changed resend text.
// A close turn validates and binds its selected day, skips the Task read,
// and supplies only close tools. The mode survives reload and resend.
// The message is rebuilt from its text alone, so nothing else the client
// sends is stored or reaches the model. The Coach's tools act for `userId`
// only, and a turn stops after maxCoachSteps model steps. Every turn reads
// the list once before the model answers (see freshRead), and the model sees
// no tool output from earlier turns, so it answers from the list as it is
// now. Daily close also reads committed progress from owned DB rows and
// the previous reply's refusals, including when cancelling. The message is
// saved before the model runs and the reply when it
// finishes, so a closed tab doesn't lose the turn: `saved` settles once both
// are written. Stopping in the browser doesn't stop the model; the reply
// still finishes and is saved. Browser EOF does not wait on persistence;
// the route's after(saved) keeps that work alive independently.
export async function coachTurn({
  userId,
  threadId,
  message,
  model,
  db = defaultDb,
  today = "",
  closeDay: requestedCloseDay,
  data: suppliedData,
}: {
  userId: string;
  threadId: unknown;
  message: unknown;
  model: LanguageModel;
  db?: Db;
  // The browser's calendar day, sent with the turn. Creates are refused
  // without one.
  today?: string;
  // Omitted inherits the stored mode; null ends it. Resends retain first-send context.
  closeDay?: unknown;
  // What the Coach reads, from `db` unless given.
  data?: CoachData;
}) {
  const incoming = newMessageText(message);
  if (!incoming) return { refused: 400 } as const;
  const earlier = await threadMessages(userId, threadId, db);
  if (!earlier) return { refused: 404 } as const;
  // A resend after a failed turn repeats the last message; answer it again.
  const resent = earlier.findIndex((m) => m.id === incoming.id);
  if (resent !== -1 && (resent !== earlier.length - 1 || earlier[resent]!.parts.length !== 1 || earlier[resent]!.parts[0]?.type !== "text" || earlier[resent]!.parts[0]?.text !== incoming.text)) {
    return { refused: 409 } as const;
  }
  const userMessage: UIMessage = {
    id: incoming.id,
    role: "user",
    parts: [{ type: "text", text: incoming.text }],
  };
  const thread = threadId as string;
  const prior = resent === -1 ? earlier : earlier.slice(0, -1);
  const prepared = await prepareCoachTurn({
    userId, threadId: thread, message: incoming, prior, resend: resent !== -1,
    today, closeDay: requestedCloseDay, db, data: suppliedData,
  });
  if ("refused" in prepared) return prepared;
  const { tools, read } = prepared;
  const messages = await historyForModel(prepared.prior, userMessage, tools, thread);

  // Start the model's view at a user message.
  const recent = messages.slice(-historyWindow);
  while (recent[0]?.role !== "user") recent.shift();
  const history = await convertToModelMessages(textOnly(recent));
  const result = streamText({
    model,
    system: prepared.system + appliedWritesBlock(prepared.prior),
    messages: [...history, ...read.messages],
    tools,
    toolsContext: prepared.toolsContext,
    // freshRead already injected the list; activeTools lets the model write
    // and call listArea again after a write. No turn-wide toolChoice:"none".
    activeTools: prepared.activeTools,
    // Last model step is text only so the turn ends with an answer.
    prepareStep: ({ steps }) =>
      steps.length >= maxCoachSteps - 1 ? { toolChoice: "none" as const } : {},
    stopWhen: isStepCount(maxCoachSteps),
    maxOutputTokens: maxReplyTokens,
    // Thinking counts toward maxReplyTokens. Top level, so the fallback
    // model gets it too.
    reasoning: "low",
    providerOptions: {
      gateway: { models: [fallbackModel], user: userId, tags: ["coach"] },
    },
    // failOnErrors logs it instead, without the request body (the thread).
    onError: () => {},
  });
  // A model or Gateway error, even after some text, means the reply isn't
  // saved; the person resends instead. (The stream can still report
  // "completed" after an error part, so the outcome alone isn't enough.) A
  // failed tool call isn't one: the model sees the error and goes on, and the
  // reply is saved with a refused receipt.
  let failed = false;
  let persistence: Promise<unknown> = Promise.resolve();
  // One copy streams to the browser, the other is read here, so the reply is
  // still saved if the browser stops reading. Reasoning isn't sent or saved.
  const [stream, ownCopy] = toUIMessageStream({
    stream: result.stream.pipeThrough(read.receipt).pipeThrough(
      failOnErrors((error) => {
        if (!failed) logTurnError(thread, model, error);
        failed = true;
      }),
    ),
    tools,
    sendReasoning: false,
    // Only runtime-authored guard reasons are safe to persist verbatim.
    // Keep the SDK's masking for DB and provider errors.
    onError: (error) => error instanceof CloseRefusal ? error.message : "An error occurred.",
    originalMessages: messages,
    generateMessageId: () => crypto.randomUUID(),
    onEnd: ({ responseMessage, outcome, finishReason }) => {
      logTurn(thread, model, responseMessage, finishReason);
      if (!failed && outcome.status === "completed") {
        // The SDK awaits onEnd before EOF. Persistence belongs to saved/after,
        // so a slow insert cannot leave useChat stuck in streaming status.
        persistence = saveMessage(userId, thread, responseMessage, db, userMessage.id);
        // Observe immediately; saved below still reports a rejected write.
        void persistence.catch((error) => logTurnError(thread, model, error, "coach.turn.save_error"));
      }
    },
  }).tee();
  return { stream, saved: readToEnd(ownCopy).then(() => persistence) };
}

// The thread as the model sees it: what was said, nothing else. Earlier tool
// calls and their output go (the list may have changed since), and so do
// step markers and blank text. A reply left with nothing is dropped, and
// back-to-back messages from one side are joined (a message whose reply
// failed, then the next one), so the thread alternates as providers expect.
const coachReadTools = new Set(["tool-listArea", "tool-listHabits", "tool-listNotebooks", "tool-listInboxDrafts", "tool-searchKnowledge", "tool-readJournalingArticle", "tool-readJournalDay", "tool-getJournalTemplate"]);

// The successful write receipts of one stored message, with absolute dates
// (no today passed). Reads and failed, refused or unchanged writes go.
function appliedReceipts(message: UIMessage): string[] {
  return message.parts.flatMap((part) => {
    if (!part.type.startsWith("tool-") || coachReadTools.has(part.type)) return [];
    const tool = part as { type: string; state?: string; output?: unknown };
    if (tool.state !== "output-available") return [];
    const output = tool.output as Record<string, unknown> | null | undefined;
    if (output && typeof output === "object" && (output.refused || output.notFound || output.invalidId || output.changed === false)) return [];
    const line = receipt(tool);
    return line ? [line] : [];
  });
}

// Saved receipts from the reloaded thread, for the system prompt: the model
// trusts the system prompt over a line written in its own voice.
export function appliedWritesBlock(messages: UIMessage[], max = 10): string {
  const lines = messages.filter((m) => m.role === "assistant").flatMap(appliedReceipts).slice(-max);
  return lines.length ? `\n\nApplied writes in this thread (saved receipts; these happened):\n${lines.map((l) => `- ${l}`).join("\n")}` : "";
}

function textOnly(messages: UIMessage[]) {
  const said: UIMessage[] = [];
  for (const message of messages) {
    const parts: UIMessage["parts"] = message.parts.filter(
      (part) => part.type === "text" && part.text.trim(),
    );
    // Earlier applied writes stay visible as one line, with absolute dates.
    if (message.role === "assistant") {
      const lines = appliedReceipts(message);
      if (lines.length) parts.push({ type: "text", text: `[Receipts: ${lines.join("; ")}]` });
    }
    if (!parts.length) continue;
    const last = said.at(-1);
    if (last?.role === message.role) last.parts.push(...parts);
    else said.push({ ...message, parts });
  }
  return said;
}

// Validates the thread for the model. The new message is already shape-checked.
// When a saved tool part no longer fits its tool (renamed, removed, or a
// changed schema), log it and leave those tool parts out of the model's view
// instead of refusing the turn forever. The stored thread is untouched.
async function historyForModel(
  earlier: UIMessage[],
  userMessage: UIMessage,
  tools: ToolSet,
  threadId: string,
) {
  try {
    return await validateUIMessages({
      messages: [...earlier, userMessage],
      tools,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const messageHead = detail.split(": Value:")[0] ?? detail;
    console.error(
      JSON.stringify({
        event: "coach.history.invalid",
        threadId,
        error: error instanceof Error ? error.name : "Error",
        // validateUIMessages puts the offending value after ": Value:".
        message: messageHead.slice(0, 300),
      }),
    );
    return [...textOnly(earlier), userMessage];
  }
}

// Calls `fail` on an error part. Reasoning counts toward maxReplyTokens, so
// a reply can hit the cap before writing any text. That's a failed turn too
// (an error part is added, so it isn't saved and the browser offers Resend),
// not an empty reply the browser would hide.
function failOnErrors(fail: (error: unknown) => void) {
  let wroteText = false;
  return new TransformStream<TextStreamPart<ToolSet>, TextStreamPart<ToolSet>>({
    transform(part, controller) {
      if (part.type === "text-delta" && part.text.trim()) wroteText = true;
      if (
        part.type === "finish" &&
        part.finishReason === "length" &&
        !wroteText
      ) {
        const error = new Error("The reply hit the token cap before any text");
        fail(error);
        controller.enqueue({ type: "error", error });
      }
      if (part.type === "error") fail(part.error);
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
      toolCalls: {
        listInboxDrafts: count("tool-listInboxDrafts"),
        fileDraft: count("tool-fileDraft"),
        listArea: count("tool-listArea"),
        listNotebooks: count("tool-listNotebooks"),
        createTask: count("tool-createTask"),
        createNote: count("tool-createNote"),
        appendJournal: count("tool-appendJournal"),
        setMood: count("tool-setMood"),
        completeTask: count("tool-completeTask"),
        scheduleTask: count("tool-scheduleTask"),
        updateTask: count("tool-updateTask"),
      },
      finishReason,
    }),
  );
}

// Provider messages can contain private prompt text. Log metadata only.
function logTurnError(threadId: string, model: LanguageModel, error: unknown, event = "coach.turn.error") {
  const metadata = error instanceof Error ? error as Error & { statusCode?: number; code?: string } : undefined;
  console.error(JSON.stringify({
    event,
    threadId,
    model: typeof model === "string" ? model : model.modelId,
    error: metadata?.name ?? "Error",
    code: metadata?.code,
    status: metadata?.statusCode,
  }));
}

async function readToEnd(stream: ReadableStream) {
  const reader = stream.getReader();
  while (!(await reader.read()).done);
}
