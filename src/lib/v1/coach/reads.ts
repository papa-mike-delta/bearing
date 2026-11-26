import { z } from "zod";
import { Workflow } from "../workflow";
import { V1, Fault, parse } from "../service";
import { db } from "@/lib/db";
import { id } from "../contracts";
import type { Source } from "./contracts";
export const readInput = z.strictObject({
  kind: z.enum([
    "item",
    "project",
    "journal",
    "tag",
    "review",
    "activity",
    "link",
  ]),
  id,
});
export class CoachReads {
  readonly sources = new Map<string, Source>();
  calls = 0;
  bytes = 0;
  constructor(readonly userId: string) {}
  private project<T>(value: T): T {
    const bytes = Buffer.byteLength(JSON.stringify(value));
    if (this.bytes + bytes > 14000)
      throw new Fault(
        429,
        "Read context budget reached; ask a narrower question",
      );
    this.bytes += bytes;
    return value;
  }
  private tick() {
    if (++this.calls > 6)
      throw new Fault(429, "Read limit reached; narrow your question");
  }
  async list(raw: unknown) {
    this.tick();
    const filters = parse(
      z.strictObject({
        type: z
          .enum([
            "task",
            "note",
            "person",
            "habit",
            "event",
            "goal",
            "bookmark",
          ])
          .optional(),
        status: z
          .enum([
            "inbox",
            "todo",
            "in_progress",
            "delegated",
            "done",
            "archived",
          ])
          .optional(),
        projectId: id.optional(),
        areaId: id.optional(),
      }),
      raw,
    );
    if (!Object.keys(filters).length)
      throw new Fault(400, "Choose a type, status, Project or Area");
    const rows = (await V1.items(this.userId, { ...filters, limit: 5 })).map(
      (row) => ({
        id: row.id,
        kind: "item",
        title: row.title,
        href: `/app/library/${row.id}`,
        excerpt: row.content.slice(0, 350),
        status: row.status,
      }),
    );
    for (const row of rows) this.sources.set(`item:${row.id}`, row);
    return this.project({
      results: rows,
      note: "At most five matching records. Narrow filters for more; this is not a complete datastore export.",
    });
  }
  async search(raw: unknown) {
    this.tick();
    const input = parse(
      z.strictObject({
        q: z.string().trim().min(2).max(120),
        kind: z
          .enum([
            "all",
            "item",
            "project",
            "journal",
            "review",
            "activity",
            "tag",
          ])
          .default("all"),
        type: z
          .enum([
            "task",
            "note",
            "habit",
            "person",
            "bookmark",
            "goal",
            "event",
          ])
          .optional(),
      }),
      raw,
    );
    const rows = (await Workflow.search(this.userId, input))
      .slice(0, 5)
      .map((r) => ({ ...r, excerpt: r.excerpt.slice(0, 350) }));
    for (const row of rows) this.sources.set(`${row.kind}:${row.id}`, row);
    return this.project({
      results: rows,
      ambiguous:
        rows.length > 1 &&
        new Set(rows.map((r) => r.title.toLowerCase())).size < rows.length,
      note: "Matches are candidates, not confirmed identities or interactions. Ask for clarification when ambiguous.",
    });
  }
  async read(raw: unknown) {
    this.tick();
    const { kind, id } = parse(readInput, raw);
    let result: any, source: Source;
    if (kind === "item") {
      const row = await V1.item(this.userId, id);
      result = {
        id: row.id,
        type: row.type,
        title: row.title,
        revision: row.revision,
        status: row.status,
        projectId: row.projectId,
        delegateId: row.delegateId,
        tagIds: row.tags.map((t) => t.tagId),
        metadata: JSON.stringify(row.metadata).slice(0, 800),
        content: row.content.slice(0, 1800),
        truncated: row.content.length > 1800,
        dueAt: row.dueAt,
        scheduledAt: row.scheduledAt,
        startAt: row.startAt,
        endAt: row.endAt,
        followUpAt: row.followUpAt,
      };
      const links = await db.link.findMany({
        where: { userId: this.userId, OR: [{ fromId: id }, { toId: id }] },
        take: 6,
        select: { id: true, fromId: true, toId: true, type: true },
      });
      result.links = links;
      for (const link of links)
        this.sources.set(`link:${link.id}`, {
          id: link.id,
          kind: "link",
          title: `${link.type.replaceAll("_", " ")} connection`,
          href: `/app/library/${id}`,
        });
      source = {
        kind,
        id,
        title: row.title,
        href: `/app/library/${id}`,
        revision: row.revision,
      };
    } else if (kind === "project") {
      const row = await db.project.findFirst({
        where: { userId: this.userId, id },
        include: { tags: { include: { tag: true } } },
      });
      if (!row) throw new Fault(404, "Not found");
      result = {
        id,
        name: row.name,
        revision: row.revision,
        description: row.description.slice(0, 1800),
        status: row.status,
        tags: row.tags
          .slice(0, 10)
          .map((t) => ({ id: t.tagId, name: t.tag.name })),
      };
      source = {
        kind,
        id,
        title: row.name,
        href: `/app/projects/${id}`,
        revision: row.revision,
      };
    } else if (kind === "journal") {
      const row = await db.journalMoment.findFirst({
        where: { userId: this.userId, id },
        include: { items: true },
      });
      if (!row) throw new Fault(404, "Not found");
      result = {
        id,
        revision: row.revision,
        text: row.text.slice(0, 1800),
        truncated: row.text.length > 1800,
        occurredAt: row.occurredAt,
        localDate: row.localDate,
        mentions: row.items.slice(0, 10),
      };
      source = {
        kind,
        id,
        title: `Journal · ${row.localDate}`,
        revision: row.revision,
        href: `/app/journal?date=${row.localDate}&moment=${id}`,
      };
    } else if (kind === "tag") {
      const row = await db.tag.findFirst({
        where: { userId: this.userId, id },
      });
      if (!row) throw new Fault(404, "Not found");
      result = { id, name: row.name, kind: row.kind };
      source = {
        kind,
        id,
        title: row.name,
        href: `/app/library?${row.kind === "area" ? "area" : "tag"}=${id}`,
      };
    } else if (kind === "activity") {
      const row = await db.activity.findFirst({
        where: { userId: this.userId, id },
      });
      if (!row) throw new Fault(404, "Not found");
      result = {
        id,
        kind: row.kind,
        occurredAt: row.occurredAt,
        itemId: row.itemId,
        data: JSON.stringify(row.data).slice(0, 1800),
      };
      source = {
        kind,
        id,
        title: `${row.kind} · ${row.localDate}`,
        href: `/app/journal?date=${row.localDate}&activity=${id}`,
      };
    } else if (kind === "link") {
      const row = await db.link.findFirst({
        where: { userId: this.userId, id },
      });
      if (!row) throw new Fault(404, "Not found");
      result = {
        id,
        fromId: row.fromId,
        toId: row.toId,
        type: row.type,
        note: row.note.slice(0, 500),
      };
      source = {
        kind,
        id,
        title: `${row.type} connection`,
        href: `/app/library/${row.fromId}`,
      };
    } else {
      const row = await db.review.findFirst({
        where: { userId: this.userId, id },
      });
      if (!row) throw new Fault(404, "Not found");
      result = {
        id,
        period: row.period,
        localDate: row.localDate,
        prompts: JSON.stringify(row.prompts).slice(0, 1800),
      };
      source = {
        kind,
        id,
        title: `${row.period} review · ${row.localDate}`,
        href: `/app/reviews/${id}`,
      };
    }
    this.sources.set(`${kind}:${id}`, source);
    return this.project(result);
  }
}
