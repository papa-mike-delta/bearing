import { createHash } from "node:crypto";
import { maxTaskNameLength, maxTaskNoteLength } from "@repo/domain";
import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(maxTaskNameLength),
  note: z.string().max(maxTaskNoteLength).optional(),
});

// Provenance id stable across a resend of the same message + name.
export function coachCreateSourceId(messageId: string, name: string) {
  const hash = createHash("sha256")
    .update(name.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return `${messageId}:${hash}`;
}

async function nextOf(
  userId: string,
  data: ToolRunContext["data"],
): Promise<{ id: string; name: string } | null> {
  const tasks = await data.listOpenTasks(userId);
  const next = tasks.find((t) => t.isNext);
  return next ? { id: next.id, name: next.name } : null;
}

export const createTask = {
  description:
    "Add a Task. `name` is required; `note` is optional. This is the same path as adding a Task on the list or from the Inbox. The result includes which Task is Next after the add.",
  inputSchema,
  async run(
    { name, note }: z.infer<typeof inputSchema>,
    { userId, messageId, data }: ToolRunContext,
  ) {
    const result = await data.createTask(
      userId,
      note === undefined ? { name } : { name, note },
      { source: "coach", sourceId: coachCreateSourceId(messageId, name) },
    );
    if (result === null) return { refused: true as const };
    return {
      id: result.id,
      name: result.name,
      next: await nextOf(userId, data),
    };
  },
};
