import { z } from "zod";
import { skillFiles } from "../skills.generated.ts";

// Only habit-design loads until the weekly-review ticket: weekly-review.md
// names tools that do not exist yet.
export const readableSkills = ["habit-design"] as const;

export const habitDesignAllowedTools = ["listHabits", "searchKnowledge", "createHabit"] as const;

export const readSkill = {
  description: "Read a known skill by name. Returns its file text or unknown skill. Reads no user data.",
  inputSchema: z.object({ name: z.string() }),
  async run({ name }: { name: string }) {
    return readableSkills.some((skill) => skill === name) && Object.hasOwn(skillFiles, name)
      ? skillFiles[name]!
      : "unknown skill";
  },
};
