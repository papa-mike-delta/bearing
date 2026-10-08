import { maxTaskNameLength, maxTaskNoteLength } from "@repo/domain";
import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(maxTaskNameLength),
  note: z.string().max(maxTaskNoteLength).optional(),
});

export const createTask = {
  description:
    "Add a Task. `name` is required; `note` is optional. This is the same path as adding a Task on the list or from the Inbox.",
  inputSchema,
  async run(
    { name, note }: z.infer<typeof inputSchema>,
    { userId, toolCallId, data }: ToolRunContext,
  ) {
    const result = await data.createTask(
      userId,
      note === undefined ? { name } : { name, note },
      { source: "coach", sourceId: toolCallId },
    );
    if (result === null) throw new Error("Couldn't create that task");
    return { id: result.id, name: result.name };
  },
};
