import type { Item } from "@prisma/client";
import crypto from "node:crypto";
import { V1, write, Fault, type Principal } from "./index";
import { snapshot } from "./backup";
import { dateInZone } from "../dates";

const marker = "system.demo";
export class V1Demo {
  static seed(p: Principal) {
    return write(p, "v1.demo.seed", {}, async (tx) => {
      if (!p.actor.startsWith("user:"))
        throw new Fault(403, "Only users may request demo data");
      const exists = await tx.preference.findUnique({
        where: { userId_key: { userId: p.userId, key: marker } },
      });
      if (exists) return { alreadySeeded: true };
      const demoBatchId = crypto.randomUUID(),
        userId = p.userId;
      const { value: area } = await V1.createTag(
        p,
        {
          kind: "area",
          name: `Demo · Wellbeing ${demoBatchId.slice(0, 6)}`,
        },
        tx,
      );
      const { value: project } = await V1.createProject(
        p,
        {
          name: "Demo · A calmer week",
          tagIds: [area.id],
        },
        tx,
      );
      const items: Item[] = [];
      for (const [type, template, title, metadata, content] of [
        [
          "task",
          "task",
          "Demo · Plan a walk",
          { version: 1 },
          "- [ ] Pick a route\n- [ ] Pack water",
        ],
        [
          "note",
          "note",
          "Demo · Walking ideas",
          { version: 1, summary: "A few nearby routes" },
          "Start with the riverside path.",
        ],
        [
          "habit",
          "routine",
          "Demo · Morning routine",
          { version: 1, cadence: "daily" },
          "- [ ] Stretch\n- [ ] Write a line",
        ],
        [
          "person",
          "person",
          "Demo · Alex",
          { version: 1, importantDates: [] },
          "A fictional friend.",
        ],
        [
          "bookmark",
          "place",
          "Demo · Riverside",
          { version: 1, category: "place", latitude: 40.71, longitude: -74 },
          "",
        ],
        [
          "goal",
          "goal",
          "Demo · Spend time outside",
          { version: 1, outcome: "A little daylight each day" },
          "",
        ],
        [
          "event",
          "event",
          "Demo · Weekend walk",
          { version: 1 },
          "A plan, not a completed interaction.",
        ],
      ] as const) {
        const now = new Date(),
          startAt = type === "event" ? new Date(+now + 86400_000) : null;
        const { value: item } = await V1.createItem(
          p,
          {
            type,
            template,
            title,
            metadata,
            content,
            status: "todo",
            projectId: project.id,
            tagIds: type === "task" ? [area.id] : [],
            startAt: startAt?.toISOString() ?? null,
            endAt: startAt ? new Date(+startAt + 3600_000).toISOString() : null,
          },
          tx,
        );
        items.push(item);
      }
      const task = items[0],
        goal = items[5],
        now = new Date(),
        localDate = dateInZone(now, "UTC");
      const { value: link } = await V1.createLink(
        p,
        {
          fromId: task.id,
          toId: goal.id,
          type: "advances",
        },
        tx,
      );
      const { value: moment } = await V1.createMoment(
        p,
        {
          clientId: `demo_${demoBatchId}`,
          text: "Demo · A short walk sounds good.",
          occurredAt: now.toISOString(),
          timezone: "UTC",
          items: [{ itemId: task.id, relation: "reference" }],
        },
        tx,
      );
      const { value: activity } = await V1.createActivity(
        p,
        {
          clientId: `demo_${demoBatchId}`,
          kind: "check_in",
          occurredAt: now.toISOString(),
          timezone: "UTC",
          data: { mood: 4, energy: 3 },
        },
        tx,
      );
      const { value: review } = await V1.createReview(
        p,
        {
          period: "daily",
          localDate,
          timezone: "UTC",
          prompts: { wins: "Demo · Made space for a break", priorities: [] },
          itemIds: [task.id],
        },
        tx,
      );
      // Maintenance metadata only; domain creation above uses the same primitives as UI/Coach.
      for (const [kind, ids] of [
        ["tag", [area.id]],
        ["project", [project.id]],
        ["item", items.map((i) => i.id)],
        ["link", [link.id]],
        ["journalMoment", [moment.id]],
        ["activity", [activity.id]],
        ["review", [review.id]],
      ] as const)
        await (tx[kind] as typeof tx.item).updateMany({
          where: { userId, id: { in: [...ids] } },
          data: { demoBatchId },
        });
      const rows = await snapshot(tx, userId);
      const ids = Object.values(rows.tables).flatMap((records) =>
        records
          .filter(
            (r) =>
              "demoBatchId" in r && r.demoBatchId === demoBatchId && "id" in r,
          )
          .map((r) => (r as { id: string }).id),
      );
      await tx.preference.create({
        data: { userId, key: marker, value: { demoBatchId, ids } },
      });
      return { seeded: true, demoBatchId, momentId: moment.id };
    });
  }
  static remove(p: Principal, confirmation: unknown) {
    return write(p, "v1.demo.remove", {}, async (tx) => {
      if (confirmation !== "REMOVE DEMO DATA" || !p.actor.startsWith("user:"))
        throw new Fault(403, "Explicit user confirmation required");
      const entry = await tx.preference.findUnique({
        where: { userId_key: { userId: p.userId, key: marker } },
      });
      if (!entry) return { removed: true };
      const { demoBatchId, ids } = entry.value as {
          demoBatchId: string;
          ids: string[];
        },
        data = await snapshot(tx, p.userId),
        demoIds = new Set(ids);
      for (const [name, rows] of Object.entries(data.tables)) {
        if (name === "ledger" || name === "preferences") continue;
        for (const row of rows) {
          if (
            "id" in row &&
            demoIds.has(row.id as string) &&
            (!("demoBatchId" in row) || row.demoBatchId !== demoBatchId)
          )
            throw new Fault(
              409,
              "Edited demo data is now personal data; remove its references explicitly",
            );
          if ("demoBatchId" in row && row.demoBatchId === demoBatchId) continue;
          // Seed-created join rows are identified by their owning demo record.
          const joinOwner = {
            itemTags: "itemId",
            projectTags: "projectId",
            momentItems: "momentId",
            reviewItems: "reviewId",
          }[name as string];
          if (
            joinOwner &&
            demoIds.has((row as Record<string, unknown>)[joinOwner] as string)
          )
            continue;
          if (
            Object.entries(row).some(
              ([key, value]) =>
                key.endsWith("Id") && demoIds.has(value as string),
            )
          )
            throw new Fault(
              409,
              "Personal data references this demo; remove those references first",
            );
        }
      }
      // Join rows owned by demo entities cascade, other data never participates.
      const where = { userId: p.userId, demoBatchId };
      await tx.activity.deleteMany({ where });
      await tx.journalMoment.deleteMany({ where });
      await tx.review.deleteMany({ where });
      await tx.link.deleteMany({ where });
      await tx.item.deleteMany({ where });
      await tx.project.deleteMany({ where });
      await tx.tag.deleteMany({ where });
      await tx.preference.delete({
        where: { userId_key: { userId: p.userId, key: marker } },
      });
      return { removed: true };
    });
  }
}
