import { expect, it } from "vitest";
import type { ItemRecord, MomentRecord, Workspace } from "./client-model";
import { perspectiveGaps } from "./perspective-gaps";
import { LinkProposals } from "./link-proposals";

function item(id: string, patch: Partial<ItemRecord> = {}): ItemRecord {
  return {
    id,
    title: id,
    type: "note",
    template: "note",
    content: "",
    status: "todo",
    priority: 0,
    projectId: null,
    delegateId: null,
    dueAt: null,
    scheduledAt: null,
    startAt: null,
    endAt: null,
    followUpAt: null,
    localDate: null,
    timezone: "UTC",
    metadata: { version: 1 },
    revision: 1,
    completedAt: null,
    createdAt: "2026-11-06T12:00:00Z",
    tags: [],
    directAreas: [],
    inheritedAreas: [],
    project: null,
    ...patch,
  };
}
function moment(id: string, patch: Partial<MomentRecord> = {}): MomentRecord {
  return {
    id,
    clientId: id,
    text: "An unfiled thought",
    revision: 1,
    occurredAt: "2026-11-06T12:00:00Z",
    capturedAt: "2026-11-06T12:00:00Z",
    createdAt: "2026-11-06T12:00:00Z",
    localDate: "2026-11-06",
    timezone: "UTC",
    needsOrganization: true,
    items: [],
    ...patch,
  };
}
function workspace(patch: Partial<Workspace> = {}): Workspace {
  return {
    items: [],
    moments: [],
    projects: [],
    links: [],
    tags: [],
    activities: [],
    reviews: [],
    habitOccurrences: [],
    preferences: {},
    ...patch,
  };
}

it("limits prompts to the records in the current perspective and changes no records", () => {
  const data = workspace({
    items: [item("visible"), item("elsewhere")],
    moments: [moment("today"), moment("another-day")],
  });
  const before = structuredClone(data);
  expect(
    perspectiveGaps(data, { itemIds: ["visible"], momentIds: ["today"] }).map(
      (gap) => gap.id,
    ),
  ).toEqual(["link:visible", "moment:today"]);
  expect(perspectiveGaps(data, {})).toEqual([]);
  expect(
    perspectiveGaps(data, { itemIds: ["not-owned"], momentIds: ["not-owned"] }),
  ).toEqual([]);
  expect(data).toEqual(before);
});

it("disappears when a canonical incoming connection is saved, and returns when removed", () => {
  const data = workspace({ items: [item("a"), item("b")] });
  const scope = { itemIds: ["a"] };
  expect(perspectiveGaps(data, scope)).toHaveLength(1);
  const linked = {
    ...data,
    links: [{ id: "l", fromId: "b", toId: "a", type: "related_to", note: "" }],
  };
  expect(perspectiveGaps(linked, scope)).toEqual([]);
  expect(perspectiveGaps({ ...linked, links: [] }, scope)).toHaveLength(1);
});

it("never proposes connecting archived Items or invents a second endpoint", () => {
  expect(
    perspectiveGaps(workspace({ items: [item("alone")] }), {
      itemIds: ["alone"],
    }),
  ).toEqual([]);
  const data = workspace({
    items: [item("active"), item("archived", { status: "archived" })],
  });
  expect(perspectiveGaps(data, { itemIds: ["active", "archived"] })).toEqual(
    [],
  );
});

it("uses the same moment relation to stop a Journal filing prompt", () => {
  const data = workspace({ moments: [moment("m")] });
  expect(
    perspectiveGaps(data, { momentIds: ["m"] }).map((gap) => gap.kind),
  ).toEqual(["moment"]);
  expect(
    perspectiveGaps(
      {
        ...data,
        moments: [
          moment("m", { items: [{ itemId: "note", relation: "reference" }] }),
        ],
      },
      { momentIds: ["m"] },
    ),
  ).toEqual([]);
});

it("offers Project placement only for an existing Project and an unassigned open Task", () => {
  const project = {
    id: "p",
    name: "A Project",
    description: "",
    revision: 1,
    status: "active",
    tags: [],
  };
  const data = workspace({
    items: [item("task", { type: "task", template: "task" })],
    projects: [project],
  });
  expect(
    perspectiveGaps(data, { projectIds: ["p"] }).map((gap) => gap.id),
  ).toEqual(["project:p"]);
  expect(perspectiveGaps(data, { projectIds: ["foreign"] })).toEqual([]);
  expect(
    perspectiveGaps(
      { ...data, items: [item("task", { type: "task", projectId: "p" })] },
      { projectIds: ["p"] },
    ),
  ).toEqual([]);
  expect(
    perspectiveGaps(
      { ...data, items: [item("task", { type: "task", status: "done" })] },
      { projectIds: ["p"] },
    ),
  ).toEqual([]);
});

it("keeps evidence-based proposals in their visible scope without adding a competing generic prompt", () => {
  const data = workspace({
    items: [
      item("alex", {
        type: "person",
        template: "person",
        title: "Alex Rivera",
      }),
    ],
    moments: [moment("m", { text: "Saw Alex Rivera" })],
  });
  expect(
    LinkProposals.forScope(data, { momentIds: ["m"] }).map(
      (card) => card.accept.kind,
    ),
  ).toEqual(["moment"]);
  expect(LinkProposals.forScope(data, { momentIds: ["other"] })).toEqual([]);
  expect(perspectiveGaps(data, { momentIds: ["m"] })).toEqual([]);
});
