import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { readSkill, habitDesignAllowedTools } from "./read-skill.ts";
import { skillsModuleSource } from "../../scripts/generate-skills.ts";
import { coachSystemPrompt } from "../prompt.ts";
import { receipt } from "../receipts.ts";

test("readSkill returns known files verbatim and unknown skill for unavailable or unsafe names", async () => {
  for (const name of ["habit-design"]) {
    const output = await readSkill.run({ name });
    assert.equal(output, await readFile(new URL(`../../skills/${name}.md`, import.meta.url), "utf8"));
    assert.equal(receipt({ type: "tool-readSkill", state: "output-available", output }), `Opened the ${name} skill`);
  }
  for (const name of ["unknown", "../knowledge/habits", "toString", "__proto__", "daily-close", "weekly-review"]) assert.equal(await readSkill.run({ name }), "unknown skill");
  assert.equal(receipt({ type: "tool-readSkill", state: "output-available", output: "unknown skill" }), "Couldn't open that skill");
});

test("embedded skills match their files", async () => {
  assert.equal(await readFile(new URL("../skills.generated.ts", import.meta.url), "utf8"), await skillsModuleSource());
});

test("habit design asks for cue and period, quotes only if-then evidence and waits for yes", async () => {
  const body = await readSkill.run({ name: "habit-design" });
  assert.match(body, /one cue/);
  assert.match(body, /one period/);
  assert.match(body, /explicit yes/);
  assert.match(body, /Quote evidence only from that returned section, including its limits and source/);
  assert.match(body, /If-then plans/);
  assert.doesNotMatch(body, /tiny|starting version|minutes|floor|start small/i);
  assert.ok(body.includes(`Allowed tools: ${habitDesignAllowedTools.join(", ")}.`));
  assert.equal(receipt({ type: "tool-readSkill", state: "output-available", output: body }), "Opened the habit-design skill");
});

test("prompt lists habit-design name and description only and README describes loading it", async () => {
  const body = await readSkill.run({ name: "habit-design" });
  const prompt = coachSystemPrompt();
  assert.ok(prompt.includes(`habit-design — ${body.split("\n")[2]}`));
  for (const line of body.split("\n").filter((line) => /^\d\.|Allowed tools:/.test(line))) assert.ok(!prompt.includes(line));
  const readme = await readFile(new URL("../../../../README.md", import.meta.url), "utf8");
  assert.match(readme, /habit-design skill loads through readSkill/);
  assert.doesNotMatch(readme, /habit-design skill has no file and is not offered/);
});

test("reconnect loads verbatim with a read receipt and a bounded one-line draft", async () => {
  const body = await readSkill.run({ name: "reconnect" });
  assert.equal(body, await readFile(new URL("../../skills/reconnect.md", import.meta.url), "utf8"));
  for (const phrase of ["up to 10", "more", "ONE line", "never send", "no research quotes", "I sent it", "logNoteOnPerson", "setPersonLastConnected", "browser's Today", "Allowed tools: listPeople, readPerson."]) assert.ok(body.includes(phrase), phrase);
  assert.equal(receipt({ type: "tool-readSkill", state: "output-available", output: body }), "Opened the reconnect skill");
});

test("reconnect receipt is classified as a read, never an applied write", async () => {
  const { shownParts } = await import("../receipts.ts");
  const output = await readSkill.run({ name: "reconnect" });
  assert.deepEqual(shownParts([{ type: "tool-readSkill", state: "output-available", output }]), [
    { key: "part-0", receipt: "Opened the reconnect skill", calls: 1, read: true },
  ]);
});

 test("reconnect always drafts when naming someone and ends with sent confirmation", async () => {
  const text = await readSkill.run({ name: "reconnect" });
  for (const phrase of ["SAME reply", "exactly one drafted message line", "top/chosen person", "clearly marked as a quote", "Never reply with only a question", 'Tell me "I sent it" once sent.']) assert.ok(text.includes(phrase), phrase);
});
