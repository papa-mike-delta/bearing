import { createHash } from "node:crypto";
import {
  linkEnd,
  maxAreaNameLength,
  maxTaskNameLength,
  maxTaskNoteLength,
  taskHref,
} from "@repo/domain";
import { z } from "zod";
import type { ToolRunContext } from "../data.ts";

const inputSchema = z.object({
  name: z.string().trim().min(1).max(maxTaskNameLength),
  note: z.string().max(maxTaskNoteLength).optional(),
  area: z.string().trim().min(1).max(maxAreaNameLength).optional(),
});

// Provenance id stable across a resend of the same message + name.
export function coachCreateSourceId(messageId: string, name: string) {
  const hash = createHash("sha256")
    .update(name.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return `${messageId}:${hash}`;
}

export const createTask = {
  description:
    "Add a Task. `name` is required; `note` is optional. When the person has more than one Area, `area` is that Area's name. With one Area, omit `area`. This is the same path as adding a Task on the list or from the Inbox. The result includes which Task is Next in that Area after the add.",
  inputSchema,
  async run(
    { name, note, area }: z.infer<typeof inputSchema>,
    { userId, messageId, data }: ToolRunContext,
  ) {
    const result = await data.createTask(
      userId,
      {
        name,
        ...(note === undefined ? {} : { note }),
        ...(area === undefined ? {} : { area }),
      },
      { source: "coach", sourceId: coachCreateSourceId(messageId, name) },
    );
    if (result === null) return { refused: true as const };
    const tasks = await data.listOpenTasks(userId);
    const areaName = tasks.find((task) => task.id === result.id)?.area;
    const next = tasks.find((task) => task.isNext && task.area === areaName);
    return {
      id: result.id,
      name: result.name,
      ...(linkEnd("task", result.id) ? { href: taskHref(result.id) } : {}),
      next: next ? { id: next.id, name: next.name } : null,
    };
  },
};
