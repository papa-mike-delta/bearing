import { describe, expect, it } from "vitest";
import type {
  ItemRecord,
  MomentRecord,
  ProjectRecord,
  Workspace,
} from "./client-model";
import { LinkProposals } from "./link-proposals";

function item(
  patch: Partial<ItemRecord> & Pick<ItemRecord, "id" | "title" | "type">,
): ItemRecord {
  return {
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
    template: patch.type,
    revision: 3,
    completedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    tags: [],
    directAreas: [],
    inheritedAreas: [],
    project: null,
    ...patch,
  };
}
function moment(
  id: string,
  items: MomentRecord["items"],
  text = "entry",
): MomentRecord {
  return {
    id,
    clientId: id,
    revision: 1,
    text,
    occurredAt: "2026-11-06T15:00:00.000Z",
    capturedAt: "2026-11-06T15:00:00.000Z",
    createdAt: "2026-11-06T15:00:00.000Z",
    localDate: "2026-11-06",
    timezone: "America/New_York",
    needsOrganization: false,
    items,
  };
}
function workspace(
  partial: Partial<Workspace> & Pick<Workspace, "items" | "moments">,
): Workspace {
  return {
    projects: [],
    tags: [],
    activities: [],
    reviews: [],
    links: [],
    habitOccurrences: [],
    preferences: {},
    ...partial,
  };
}
const me = item({
  id: "me",
  type: "person",
  title: "Me",
  selfProfile: { userId: "owner" },
});
const alex = item({ id: "alex", type: "person", title: "Alex" });
const note = item({ id: "note", type: "note", title: "Clinic note" });
const project: ProjectRecord = {
  id: "proj",
  name: "Launch",
  description: "",
  revision: 0,
  status: "active",
  tags: [
    {
      tagId: "home",
      tag: { id: "home", name: "Home", kind: "area" },
    },
  ],
};

describe("LinkProposals", () => {
  it("proposes a mentions Link when a Journal entry records another Item", () => {
    const cards = LinkProposals.infer(
      workspace({
        items: [me, alex, note],
        moments: [
          moment("m1", [
            { itemId: "alex", relation: "mention" },
            { itemId: "note", relation: "reference" },
          ]),
        ],
      }),
    );
    expect(cards).toMatchObject([
      {
        id: "mention:m1:note:alex",
        confidence: "proposal",
        accept: {
          kind: "link",
          fromId: "note",
          toId: "alex",
          type: "mentions",
          fromRevision: 3,
          toRevision: 3,
        },
      },
    ]);
  });

  it("proposes a Journal mention from the entry text when none is stored", () => {
    const data = workspace({
      items: [me, alex],
      moments: [moment("m1", [], "Saw Alex today")],
    });
    expect(LinkProposals.infer(data)).toMatchObject([
      {
        id: "journal-mention:m1:alex",
        accept: {
          kind: "moment",
          relation: "mention",
          itemId: "alex",
          revision: 1,
        },
      },
    ]);
    expect(LinkProposals.namesPerson("Alexandra called", "Alex")).toBe(false);
    expect(LinkProposals.namesPerson("help me today", "Me")).toBe(false);
    const stored = workspace({
      items: [me, alex],
      moments: [
        moment("m1", [{ itemId: "alex", relation: "mention" }], "Saw Alex today"),
      ],
    });
    expect(
      LinkProposals.infer(stored).some((card) => card.accept.kind === "moment"),
    ).toBe(false);
    expect(LinkProposals.reject()).toEqual({ writes: false });
  });

  it("suggests a health word as text, and ignores lookalike tokens and shared Areas", () => {
    const area = { id: "home", name: "Health", kind: "area" as const };
    const medication = item({
      id: "med",
      type: "note",
      title: "Medication log",
      content: "Take with food.",
    });
    const healthcare = item({
      id: "care",
      type: "note",
      title: "Healthcare portal",
      content: "A healthy routine and an allergic note.",
    });
    const neighbor = item({
      id: "groceries",
      type: "note",
      title: "Grocery list",
      content: "eggs",
      directAreas: [area],
      tags: [{ tagId: area.id, tag: area }],
    });
    const linked = item({
      id: "linked",
      type: "note",
      title: "Already linked",
      directAreas: [area],
      tags: [{ tagId: area.id, tag: area }],
    });
    const cards = LinkProposals.infer(
      workspace({
        items: [me, medication, healthcare, neighbor, linked],
        moments: [],
        links: [
          {
            id: "existing",
            fromId: "me",
            toId: "linked",
            type: "related_to",
            note: "",
          },
        ],
      }),
    );
    expect(cards.map((card) => card.id)).toEqual(["health:med:me"]);
    expect(cards[0]).toMatchObject({
      confidence: "suggestion",
      accept: { type: "related_to", fromId: "med", toId: "me" },
    });
    expect(cards[0].reason).toContain("word “medication”");
    expect(cards[0].reason).toContain("Suggestion only");
  });

  it("suggests a directly missing inherited Area and does not copy it", () => {
    const task = item({
      id: "task",
      type: "task",
      title: "Write",
      projectId: project.id,
      project,
      inheritedAreas: [{ id: "home", name: "Home", kind: "area" }],
    });
    const cards = LinkProposals.infer(
      workspace({ items: [me, task], moments: [] }),
    );
    expect(cards).toMatchObject([
      {
        confidence: "suggestion",
        accept: { kind: "area", itemId: "task", tagId: "home", revision: 3 },
      },
    ]);
    task.directAreas = [{ id: "home", name: "Home", kind: "area" }];
    expect(LinkProposals.infer(workspace({ items: [me, task], moments: [] }))).toEqual(
      [],
    );
  });

  it("proposes a capture location and a checklist Project without using stored coordinates alone", () => {
    const place = item({
      id: "place",
      type: "bookmark",
      template: "place",
      title: "Cafe",
      metadata: {
        version: 1,
        category: "place",
        latitude: 40.71,
        longitude: -74,
        capturedMomentId: "gps",
      },
    });
    const oldPlace = item({
      id: "old",
      type: "bookmark",
      template: "place",
      title: "Old cafe",
      metadata: {
        version: 1,
        category: "place",
        latitude: 1,
        longitude: 2,
      },
    });
    const parent = item({
      id: "parent",
      type: "task",
      title: "Parent",
      projectId: project.id,
      project,
      content: "- [Call](/app/library/child)",
    });
    const child = item({
      id: "child",
      type: "task",
      title: "Call",
      projectId: null,
    });
    const cards = LinkProposals.infer(
      workspace({
        items: [me, place, oldPlace, parent, child],
        moments: [
          moment("gps", [{ itemId: "place", relation: "reference" }], "Cafe"),
          moment("old", [{ itemId: "old", relation: "reference" }], "Old cafe"),
        ],
        projects: [project],
      }),
    );
    expect(cards.map((card) => card.id).sort()).toEqual([
      "located:gps:place",
      "project:child:proj",
    ]);
    expect(cards.find((card) => card.id.startsWith("located"))?.reason).toContain(
      "does not place Me",
    );
    expect(JSON.stringify(cards)).not.toContain("advances");
  });

  it("suggests a Note filed on an entry that mentions Me, separately from health words", () => {
    const groceries = item({
      id: "groceries",
      type: "note",
      title: "Grocery list",
      content: "eggs",
    });
    const cards = LinkProposals.infer(
      workspace({
        items: [me, groceries],
        moments: [
          moment(
            "m1",
            [
              { itemId: "me", relation: "mention" },
              { itemId: "groceries", relation: "reference" },
            ],
            "With me",
          ),
        ],
      }),
    );
    expect(cards.map((card) => card.id)).toEqual([
      "me-note:groceries:me",
      "mention:m1:groceries:me",
    ]);
    expect(cards[0].confidence).toBe("suggestion");
    expect(cards[0].accept).toMatchObject({ type: "related_to" });
    expect(LinkProposals.acceptance.map((row) => row.case)).toEqual([
      "journal-person-mention",
      "gps-place",
      "task-in-project",
      "health-note",
      "area-inheritance",
      "me-related-note",
    ]);
  });

  it("does not turn a Project Goal or stored coordinates into a Link", () => {
    const goal = item({
      id: "goal",
      type: "goal",
      title: "Ship",
      projectId: project.id,
      project,
    });
    const task = item({
      id: "task",
      type: "task",
      title: "Write",
      projectId: project.id,
      project: { ...project, tags: [] },
      inheritedAreas: [],
    });
    const place = item({
      id: "place",
      type: "bookmark",
      template: "place",
      title: "Cafe",
      metadata: {
        version: 1,
        category: "place",
        latitude: 40.71,
        longitude: -74,
      },
    });
    const cards = LinkProposals.infer(
      workspace({
        items: [me, goal, task, place],
        moments: [
          moment("gps", [{ itemId: "place", relation: "reference" }], "Cafe"),
        ],
      }),
    );
    expect(cards).toEqual([]);
    expect(JSON.stringify(cards)).not.toContain("located_at");
    expect(JSON.stringify(cards)).not.toContain("advances");
  });
});
