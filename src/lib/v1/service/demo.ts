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
      const { demoBatchId } = entry.value as { demoBatchId: string };
      const where = { userId: p.userId, demoBatchId };
      const [demoItems, demoProjects, demoTags, demoMoments, demoReviews] =
        await Promise.all([
          tx.item.findMany({ where, select: { id: true } }),
          tx.project.findMany({ where, select: { id: true } }),
          tx.tag.findMany({ where, select: { id: true } }),
          tx.journalMoment.findMany({ where, select: { id: true } }),
          tx.review.findMany({ where, select: { id: true } }),
        ]);
      const demoItemIds = demoItems.map((row) => row.id);
      const demoProjectIds = demoProjects.map((row) => row.id);
      const demoTagIds = demoTags.map((row) => row.id);
      // Personal rows keep their content. References into the demo batch are cleared.
      if (demoProjectIds.length)
        await tx.item.updateMany({
          where: {
            userId: p.userId,
            projectId: { in: demoProjectIds },
            OR: [{ demoBatchId: null }, { demoBatchId: { not: demoBatchId } }],
          },
          data: { projectId: null, revision: { increment: 1 } },
        });
      if (demoItemIds.length) {
        const delegated = await tx.item.findMany({
          where: {
            userId: p.userId,
            delegateId: { in: demoItemIds },
            OR: [{ demoBatchId: null }, { demoBatchId: { not: demoBatchId } }],
          },
        });
        for (const task of delegated)
          await tx.item.update({
            where: { userId_id: { userId: p.userId, id: task.id } },
            data: {
              delegateId: null,
              status: task.status === "delegated" ? "todo" : task.status,
              revision: { increment: 1 },
            },
          });
        await tx.momentItem.deleteMany({
          where: { userId: p.userId, itemId: { in: demoItemIds } },
        });
        await tx.reviewItem.deleteMany({
          where: { userId: p.userId, itemId: { in: demoItemIds } },
        });
        await tx.link.deleteMany({
          where: {
            userId: p.userId,
            OR: [
              { fromId: { in: demoItemIds } },
              { toId: { in: demoItemIds } },
            ],
          },
        });
        await tx.activity.updateMany({
          where: {
            userId: p.userId,
            itemId: { in: demoItemIds },
            OR: [{ demoBatchId: null }, { demoBatchId: { not: demoBatchId } }],
          },
          data: { itemId: null, revision: { increment: 1 } },
        });
        await tx.taskOccurrence.updateMany({
          where: { userId: p.userId, nextItemId: { in: demoItemIds } },
          data: { nextItemId: null },
        });
        const series = await tx.recurrence.findMany({
          where: { userId: p.userId, itemId: { in: demoItemIds } },
          select: { id: true },
        });
        if (series.length) {
          await tx.taskOccurrence.deleteMany({
            where: {
              userId: p.userId,
              recurrenceId: { in: series.map((row) => row.id) },
            },
          });
          await tx.recurrence.deleteMany({
            where: { userId: p.userId, id: { in: series.map((row) => row.id) } },
          });
        }
        await tx.taskOccurrence.deleteMany({
          where: { userId: p.userId, itemId: { in: demoItemIds } },
        });
      }
      if (demoTagIds.length) {
        await tx.itemTag.deleteMany({
          where: { userId: p.userId, tagId: { in: demoTagIds } },
        });
        await tx.projectTag.deleteMany({
          where: { userId: p.userId, tagId: { in: demoTagIds } },
        });
      }
      if (demoMoments.length)
        await tx.momentItem.deleteMany({
          where: {
            userId: p.userId,
            momentId: { in: demoMoments.map((row) => row.id) },
          },
        });
      if (demoReviews.length)
        await tx.reviewItem.deleteMany({
          where: {
            userId: p.userId,
            reviewId: { in: demoReviews.map((row) => row.id) },
          },
        });
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
