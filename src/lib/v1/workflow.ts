import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { V1, parse, write, type Principal } from "./service";
import { CoachTrust } from "./coach/trust";
import { preferencesInput, searchInput } from "./workflow-contracts";
const includeMoment = { items: { include: { item: true } } } as const;
export class Workflow {
  static setPreferences(p: Principal, raw: unknown) {
    return write(p, "v1.preferences.update", raw, async (tx) => {
      const value = parse(preferencesInput, raw);
      for (const [key, val] of Object.entries(value))
        await tx.preference.upsert({
          where: { userId_key: { userId: p.userId, key: `workflow.${key}` } },
          create: { userId: p.userId, key: `workflow.${key}`, value: val },
          update: { value: val },
        });
      return value;
    });
  }
  static async preferences(userId: string) {
    const rows = await db.preference.findMany({
      where: { userId, key: { startsWith: "workflow." } },
    });
    return Object.fromEntries(rows.map((r) => [r.key.slice(9), r.value]));
  }
  static async workspace(userId: string) {
    const [
      items,
      projects,
      tags,
      moments,
      activities,
      reviews,
      preferences,
      links,
      habitOccurrences,
      trust,
    ] = await Promise.all([
      V1.items(userId),
      db.project.findMany({
        where: { userId },
        include: { tags: { include: { tag: true } } },
      }),
      db.tag.findMany({ where: { userId } }),
      db.journalMoment.findMany({
        where: { userId },
        include: includeMoment,
        orderBy: { occurredAt: "desc" },
      }),
      db.activity.findMany({
        where: { userId },
        orderBy: { occurredAt: "desc" },
      }),
      db.review.findMany({ where: { userId } }),
      Workflow.preferences(userId),
      db.link.findMany({ where: { userId } }),
      db.preference.findMany({
        where: { userId, key: { startsWith: "habit." } },
        select: { key: true, value: true },
      }),
      CoachTrust.read(db, userId),
    ]);
    return {
      items,
      projects,
      tags,
      moments,
      activities,
      reviews,
      preferences,
      trust,
      links,
      habitOccurrences,
    };
  }
  static async search(userId: string, raw: unknown) {
    const value = parse(searchInput, raw),
      q = value.q.replace(/[\\%_]/g, "\\$&");
    const results: {
      id: string;
      kind: string;
      title: string;
      excerpt: string;
      href: string;
    }[] = [];
    const wants = (kind: string) => value.kind === "all" || value.kind === kind;
    const itemWhere = {
      userId,
      ...(value.type ? { type: value.type } : {}),
      ...(value.projectId ? { projectId: value.projectId } : {}),
      ...(value.areaId
        ? {
            OR: [
              {
                tags: { some: { tagId: value.areaId, tag: { kind: "area" } } },
              },
              {
                project: {
                  tags: {
                    some: { tagId: value.areaId, tag: { kind: "area" } },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const match = (fields: string[]) =>
      fields.map((key) => ({
        [key]: { contains: q, mode: "insensitive" as const },
      }));
    const pattern = `%${q}%`;
    const metadataMatches = wants("item")
      ? await db.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT "id" FROM "V1Item" WHERE "userId" = ${userId} AND "metadata"::text ILIKE ${pattern}`,
        )
      : [];
    if (wants("item"))
      for (const row of await db.item.findMany({
        where: {
          ...itemWhere,
          AND: [
            {
              OR: [
                ...match(["title", "content"]),
                { id: { in: metadataMatches.map((r) => r.id) } },
              ],
            },
          ],
        },
        take: 50,
      }))
        results.push({
          id: row.id,
          kind: "item",
          title: row.title,
          excerpt: row.content.slice(0, 240),
          href: `/app/library/${row.id}`,
        });
    const recordsFilter = !!(value.areaId || value.projectId || value.type);
    if (wants("project") && !value.type)
      for (const row of await db.project.findMany({
        where: {
          userId,
          ...(value.projectId ? { id: value.projectId } : {}),
          ...(value.areaId
            ? { tags: { some: { tagId: value.areaId, tag: { kind: "area" } } } }
            : {}),
          OR: match(["name", "description"]),
        },
        take: 50,
      }))
        results.push({
          id: row.id,
          kind: "project",
          title: row.name,
          excerpt: row.description.slice(0, 240),
          href: `/app/projects/${row.id}`,
        });
    if (wants("journal"))
      for (const row of await db.journalMoment.findMany({
        where: {
          userId,
          text: { contains: q, mode: "insensitive" },
          ...(recordsFilter ? { items: { some: { item: itemWhere } } } : {}),
        },
        take: 50,
      }))
        results.push({
          id: row.id,
          kind: "journal",
          title: `Journal · ${row.localDate}`,
          excerpt: row.text.slice(0, 240),
          href: `/app/journal?date=${row.localDate}&moment=${row.id}`,
        });
    if (wants("review")) {
      const matches = await db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT "id" FROM "V1Review" WHERE "userId" = ${userId} AND ("prompts"::text ILIKE ${pattern} OR "period" ILIKE ${pattern})`,
      );
      const rows = await db.review.findMany({
        where: {
          userId,
          id: { in: matches.map((r) => r.id) },
          ...(recordsFilter ? { items: { some: { item: itemWhere } } } : {}),
        },
        take: 50,
      });
      for (const row of rows)
        results.push({
          id: row.id,
          kind: "review",
          title: `${row.period} review · ${row.localDate}`,
          excerpt: JSON.stringify(row.prompts).slice(0, 240),
          href: `/app/reviews/${row.id}`,
        });
    }
    if (wants("activity")) {
      const matches = await db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT "id" FROM "V1Activity" WHERE "userId" = ${userId} AND ("data"::text ILIKE ${pattern} OR "kind" ILIKE ${pattern})`,
      );
      for (const row of await db.activity.findMany({
        where: {
          userId,
          id: { in: matches.map((r) => r.id) },
          ...(recordsFilter ? { item: itemWhere } : {}),
        },
        take: 50,
      }))
        results.push({
          id: row.id,
          kind: "activity",
          title: `${row.kind.replaceAll("_", " ")} · ${row.localDate}`,
          excerpt: JSON.stringify(row.data).slice(0, 240),
          href: `/app/journal?date=${row.localDate}&activity=${row.id}`,
        });
    }
    if (wants("tag") && !recordsFilter)
      for (const row of await db.tag.findMany({
        where: { userId, name: { contains: q, mode: "insensitive" } },
        take: 50,
      }))
        results.push({
          id: row.id,
          kind: "tag",
          title: `${row.kind === "area" ? "Area" : "Tag"}: ${row.name}`,
          excerpt: "",
          href: `/app/library?${row.kind === "area" ? "area" : "tag"}=${row.id}`,
        });
    return results;
  }
}
