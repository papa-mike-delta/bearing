import {
  appendJournal,
  createHabit,
  trackHabit,
  fileDraft,
  listInboxDrafts,
  completeTask,
  createNote,
  listNotebooks,
  listHabits,
  createTask,
  listArea,
  maxCreatesPerTurn,
  CloseRefusal,
  setMood,
  scheduleTask,
  updateTask,
  type CoachData,
  type ToolRunContext,
} from "@repo/coach";
import { searchKnowledge } from "@repo/coach/knowledge";
import {
  tool,
  type ModelMessage,
  type TextStreamPart,
  type Tool,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { DraftError } from "./draft-filing/index.ts";
import { JournalError } from "./journal.ts";
import { MoodError } from "./mood.ts";
import { HabitError } from "./habits.ts";
import { NoteError } from "./notes.ts";
import { isJournalDay } from "./journal-day.ts";

export { maxCreatesPerTurn };

// Checked by the SDK on every call, before executing a tool. Identity comes
// from the session and triggering message, never from model-selected input.
const toolContext = z.object({
  userId: z.uuid(),
  messageId: z.uuid(),
  today: z.string().optional(),
  messageCreatedAt: z.number().int().nonnegative().optional(),
});
type Context = z.infer<typeof toolContext>;

const caps = {
  write: {
    max: maxCreatesPerTurn,
    message: `You can make only ${maxCreatesPerTurn} Task, Note, Journal, Mood, filing or Habit writes per reply.`,
  },
  complete: { max: 1, message: "You can complete only one Task per reply." },
  schedule: { max: 3, message: "You can schedule only 3 Tasks per reply." },
  update: { max: 3, message: "You can update only 3 Tasks per reply." },
};
type Cap = keyof typeof caps;

// One instance belongs to one reply. Reservations are synchronous: parallel
// tool calls share attempts. Failed and unchanged writes release their slot.
function turnAttempts() {
  const counts = { write: 0, complete: 0, schedule: 0, update: 0 };
  let journalAppends = 0;
  let habitCalls = 0;
  return {
    reserve(cap: Cap | undefined, append: boolean, habit: boolean) {
      if (cap) {
        if (counts[cap] >= caps[cap].max) throw new Error(caps[cap].message);
        counts[cap] += 1;
      }
      return {
        settle(applied: boolean) {
          if (cap && !applied) counts[cap] -= 1;
        },
        ...(append && { appendOrdinal: ++journalAppends }),
        ...(habit && { habitOrdinal: ++habitCalls }),
      };
    },
  };
}
type Attempts = ReturnType<typeof turnAttempts>;

function checkDay(day: string | undefined, today: string | undefined) {
  const resolved = day === undefined || day === "today" ? today : day;
  if (!today || !isJournalDay(today))
    throw new Error(
      "Supply the browser's Today as a real YYYY-MM-DD calendar day, then retry.",
    );
  if (!isJournalDay(resolved) || resolved > today)
    throw new Error("This day is not open yet.");
}

export function logToolError(toolName: string, toolCallId: string, error: unknown) {
  console.error(
    JSON.stringify({
      event: "coach.tool.error",
      tool: toolName,
      toolCallId,
      error: error instanceof Error ? error.name : "Error",
      code:
        error instanceof Error
          ? (error.cause as { code?: string } | undefined)?.code
          : undefined,
    }),
  );
}

type Policy<Input> = {
  cap?: Cap;
  appendOrdinal?: boolean;
  habitOrdinal?: boolean;
  validateDay?: (input: Input, context: Context) => void;
  failure: string | null;
  safeErrors?: readonly (new (...args: never[]) => Error)[];
  closeRefusal?: boolean;
};

// The descriptor keeps the core schema/output inference through SDK binding.
// Journal and Habit writes use reserved call ordinals for replay identity.
function executionTool<Name extends string, Input, Output extends object>(
  name: Name,
  core: {
    description: string;
    inputSchema: z.ZodType<Input>;
    run: (
      input: Input,
      context: ToolRunContext & { appendOrdinal: number; habitOrdinal: number },
    ) => Promise<Output>;
  },
  policy: Policy<Input>,
) {
  async function run(
    input: Input,
    context: ToolRunContext & { appendOrdinal?: number; habitOrdinal?: number },
  ) {
    const runContext = context as ToolRunContext & { appendOrdinal: number; habitOrdinal: number };
    // Static knowledge has always been uncapped and unwrapped.
    if (policy.failure === null) return core.run(input, runContext);
    try {
      return await core.run(input, runContext);
    } catch (error) {
      if (policy.closeRefusal && error instanceof CloseRefusal) throw error;
      logToolError(name, context.toolCallId, error);
      const safe = policy.safeErrors?.some(
        (ErrorType) => error instanceof ErrorType,
      );
      throw new Error(
        safe && error instanceof Error ? error.message : policy.failure,
      );
    }
  }
  return {
    name,
    bind(data: CoachData, attempts: Attempts) {
      const execute = async (
        input: Input,
        { context, toolCallId }: { context: Context; toolCallId: string },
      ) => {
        const reservation = attempts.reserve(
          policy.cap,
          policy.appendOrdinal ?? false,
          policy.habitOrdinal ?? false,
        );
        const { settle, ...ordinals } = reservation;
        let applied = false;
        try {
          policy.validateDay?.(input, context);
          const result = await run(input, { ...context, toolCallId, data, ...ordinals });
          const flags = result as { refused?: boolean; notFound?: boolean; invalidId?: boolean; changed?: boolean };
          applied = !(flags.refused || flags.notFound || flags.invalidId || flags.changed === false);
          return result;
        } finally {
          settle(applied);
        }
      };
      // The SDK's conditional output type cannot resolve a generic Output;
      // the core schema and run function retain each concrete input/output.
      return tool<Input, Output, Context>({
        description: core.description,
        inputSchema: core.inputSchema,
        contextSchema: toolContext,
        execute,
      } as unknown as Tool<Input, Output, Context> & {
        execute: typeof execute;
      });
    },
    run,
  };
}

// The single vocabulary, in the existing tool-set key order. Each declaration
// owns its core tool, attempt kind, calendar checks and safe failure policy.
const vocabulary = [
  executionTool("listInboxDrafts", listInboxDrafts, {
    failure: "Couldn't read your Inbox drafts.",
  }),
  executionTool("fileDraft", fileDraft, {
    cap: "write",
    failure: "Couldn't file that draft.",
    closeRefusal: true,
    safeErrors: [DraftError, JournalError, NoteError],
    validateDay: (input, context) => {
      if (input.destination.kind === "journal")
        checkDay(input.destination.day, context.today);
    },
  }),
  executionTool("appendJournal", appendJournal, {
    cap: "write",
    appendOrdinal: true,
    failure: "Couldn't append to that Journal day.",
    closeRefusal: true,
    safeErrors: [JournalError],
    validateDay: (input, context) => checkDay(input.day, context.today),
  }),
  executionTool("setMood", setMood, {
    cap: "write",
    failure: "Couldn't set that mood.",
    closeRefusal: true,
    safeErrors: [MoodError],
    validateDay: (input, context) => checkDay(input.day, context.today),
  }),
  executionTool("createHabit", createHabit, {
    cap: "write",
    habitOrdinal: true,
    failure: "Couldn't create that habit.",
    safeErrors: [HabitError],
    validateDay: (_input, context) => checkDay(undefined, context.today),
  }),
  executionTool("trackHabit", trackHabit, {
    cap: "write",
    habitOrdinal: true,
    failure: "Couldn't track that habit.",
    safeErrors: [HabitError],
    validateDay: (_input, context) => checkDay(undefined, context.today),
  }),
  executionTool("listHabits", listHabits, {
    failure: "Couldn't read your habits.",
    validateDay: (_input, context) => checkDay(undefined, context.today),
  }),
  executionTool("listNotebooks", listNotebooks, {
    failure: "Couldn't read your notebooks.",
  }),
  executionTool(
    "searchKnowledge",
    {
      description:
        "Look up one knowledge-article section by the words in its heading. Returns that section and the article title, or no match. Quote the section, including what it does not mean and the source. Do not paraphrase, and do not invent a section.",
      inputSchema: z.object({ query: z.string().trim().min(1).max(200) }),
      run: async ({ query }) => searchKnowledge(query),
    },
    { failure: null },
  ),
  executionTool("createNote", createNote, {
    cap: "write",
    failure: "Couldn't create that Note.",
  }),
  executionTool("listArea", listArea, {
    failure: "The list couldn't be read.",
  }),
  executionTool("createTask", createTask, {
    cap: "write",
    failure: "Couldn't create that task.",
  }),
  executionTool("completeTask", completeTask, {
    cap: "complete",
    failure: "Couldn't complete that task.",
  }),
  executionTool("scheduleTask", scheduleTask, {
    cap: "schedule",
    failure: "Couldn't schedule that task.",
  }),
  executionTool("updateTask", updateTask, {
    cap: "update",
    failure: "Couldn't update that task.",
  }),
] as const;

type CoachTools = {
  [Descriptor in (typeof vocabulary)[number] as Descriptor["name"]]: ReturnType<
    Descriptor["bind"]
  >;
};
type CoachToolName = keyof CoachTools;

export function coachTools(data: CoachData): CoachTools {
  const attempts = turnAttempts();
  return Object.fromEntries(
    vocabulary.map((descriptor) => [
      descriptor.name,
      descriptor.bind(data, attempts),
    ]),
  ) as CoachTools;
}

type Names<Descriptors extends readonly { name: string }[]> = {
  [Index in keyof Descriptors]: Descriptors[Index]["name"];
};
const [inboxRead, draftFiling, ...remainingNames] = vocabulary.map(
  (descriptor) => descriptor.name,
) as unknown as Names<typeof vocabulary>;
// The context/name list historically starts with fileDraft, then Inbox reads.
export const coachToolNames = [
  draftFiling,
  inboxRead,
  ...remainingNames,
] as const;

export function coachToolsContext(
  userId: string,
  messageId: string,
  today = "",
  messageCreatedAt?: number,
) {
  return Object.fromEntries(
    coachToolNames.map((name) => [
      name,
      { userId, messageId, today, messageCreatedAt },
    ]),
  ) as {
    [Name in CoachToolName]: {
      userId: string;
      messageId: string;
      today: string;
      messageCreatedAt?: number;
    };
  };
}

export async function freshRead(userId: string, data: CoachData) {
  const toolCallId = `read_${crypto.randomUUID().replaceAll("-", "")}`;
  const call = { toolCallId, toolName: "listArea" } as const;
  // freshRead has no user message; a placeholder uuid keeps the context shape.
  const messageId = "00000000-0000-4000-8000-000000000000";
  const output = await vocabulary
    .find((descriptor) => descriptor.name === "listArea")!
    .run({}, { userId, toolCallId, messageId, data });
  const messages: ModelMessage[] = [
    { role: "assistant", content: [{ type: "tool-call", ...call, input: {} }] },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          ...call,
          output: {
            type: "json",
            value: { ...output, note: "The person's list right now." },
          },
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
