import { z } from "zod";
import { skills } from "../skills.ts";
import { skillFiles } from "../skills.generated.ts";

export const habitDesignAllowedTools = ["listHabits", "searchKnowledge", "createHabit"] as const;

export const readSkill = {
  description: "Read a known skill by name. Returns its file text or unknown skill. Reads no user data.",
  inputSchema: z.object({ name: z.string() }),
  async run({ name }: { name: string }) {
    return skills.some((skill) => skill === name) && Object.hasOwn(skillFiles, name)
      ? skillFiles[name]!
      : "unknown skill";
  },
};
