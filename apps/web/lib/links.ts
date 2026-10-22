import {
  areas,
  db as defaultDb,
  entityLinks,
  journalEntries,
  notebooks,
  notes,
  people,
  tasks,
} from "@repo/db";
import {
  isCalendarDay,
  isSelfLink,
  linkEnd,
  linkPageSize,
  noteHref,
  taskHref,
  type LinkEnd,
  type LinkKind,
  type PickerHit,
  type RelatedItem,
  type RelatedLists,
} from "@repo/domain";
import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { isUuid, type Db } from "./db.ts";
import { formatJournalDay } from "./journal-day.ts";

export type AddLinkResult =
  { ok: true; created: boolean } | { ok: false; reason: "self" | "not-found" };

export type RemoveLinkResult =
  | { ok: true; targetType: string; targetId: string }
  | { ok: false; reason: "not-found" };

function parseEnd(end: LinkEnd) {
  return linkEnd(end.kind, end.id);
}

function lockOrder(source: LinkEnd, target: LinkEnd) {
  return [source, target].sort((a, b) =>
    `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
  );
}

async function lockOwned(tx: Db, userId: string, end: LinkEnd, today: string) {
  if (end.kind === "task") {
    const [owned] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(areas, eq(areas.id, tasks.areaId))
      .where(and(eq(tasks.id, end.id), eq(areas.userId, userId)));
    if (!owned) return false;
    const [locked] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.id, end.id))
      .for("update");
    return Boolean(locked);
  }
  if (end.kind === "note") {
    const [locked] = await tx
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, end.id), eq(notes.userId, userId)))
      .for("update");
    return Boolean(locked);
  }
  if (end.kind === "person") {
    const [locked] = await tx
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.id, end.id), eq(people.userId, userId)))
      .for("update");
    return Boolean(locked);
  }
  if (!isCalendarDay(today) || end.id > today) return false;
  const [locked] = await tx
    .select({ id: journalEntries.id, body: journalEntries.body })
    .from(journalEntries)
    .where(
      and(eq(journalEntries.userId, userId), eq(journalEntries.day, end.id)),
    )
    .for("update");
  return Boolean(locked && locked.body.trim());
}

export async function addLink(
  userId: string,
  source: LinkEnd,
  target: LinkEnd,
  today: string,
  db: Db = defaultDb,
): Promise<AddLinkResult> {
  const from = parseEnd(source);
  const to = parseEnd(target);
  if (!isUuid(userId) || !from || !to) {
    return { ok: false, reason: "not-found" };
  }
  if (isSelfLink(from, to)) return { ok: false, reason: "self" };
  return db.transaction(async (tx) => {
    for (const end of lockOrder(from, to)) {
      if (!(await lockOwned(tx, userId, end, today))) {
        return { ok: false, reason: "not-found" };
      }
    }
    const [row] = await tx
      .insert(entityLinks)
      .values({
        userId,
        sourceType: from.kind,
        sourceId: from.id,
        targetType: to.kind,
        targetId: to.id,
      })
      .onConflictDoNothing({
        target: [
          entityLinks.userId,
          entityLinks.sourceType,
          entityLinks.sourceId,
          entityLinks.targetType,
          entityLinks.targetId,
        ],
      })
      .returning({ id: entityLinks.id });
    return { ok: true, created: Boolean(row) };
  });
}

export async function removeLink(
  userId: string,
  edgeId: string,
  source: LinkEnd,
  db: Db = defaultDb,
): Promise<RemoveLinkResult> {
  const parsed = parseEnd(source);
  if (!isUuid(userId) || !isUuid(edgeId) || !parsed) {
    return { ok: false, reason: "not-found" };
  }
  const [row] = await db
    .delete(entityLinks)
    .where(
      and(
        eq(entityLinks.id, edgeId),
        eq(entityLinks.userId, userId),
        eq(entityLinks.sourceType, parsed.kind),
        eq(entityLinks.sourceId, parsed.id),
      ),
    )
    .returning({
      targetType: entityLinks.targetType,
      targetId: entityLinks.targetId,
    });
  return row ? { ok: true, ...row } : { ok: false, reason: "not-found" };
}

type Edge = { edgeId: string; kind: string; id: string };

async function showEnds(
  db: Db,
  userId: string,
  edges: Edge[],
): Promise<RelatedItem[]> {
  const taskIds = edges
    .filter((edge) => edge.kind === "task" && isUuid(edge.id))
    .map((edge) => edge.id);
  const noteIds = edges
    .filter((edge) => edge.kind === "note" && isUuid(edge.id))
    .map((edge) => edge.id);
  const personIds = edges
    .filter((edge) => edge.kind === "person" && isUuid(edge.id))
    .map((edge) => edge.id);
  const days = edges
    .filter((edge) => edge.kind === "journal" && isCalendarDay(edge.id))
    .map((edge) => edge.id);
  const [taskRows, noteRows, dayRows, personRows] = await Promise.all([
    taskIds.length
      ? db
          .select({
            id: tasks.id,
            name: tasks.name,
            status: tasks.status,
            areaName: areas.name,
          })
          .from(tasks)
          .innerJoin(areas, eq(areas.id, tasks.areaId))
          .where(and(eq(areas.userId, userId), inArray(tasks.id, taskIds)))
      : [],
    noteIds.length
      ? db
          .select({
            id: notes.id,
            title: notes.title,
            notebookId: notes.notebookId,
            notebookName: notebooks.name,
          })
          .from(notes)
          .leftJoin(notebooks, eq(notebooks.id, notes.notebookId))
          .where(and(eq(notes.userId, userId), inArray(notes.id, noteIds)))
      : [],
    days.length
      ? db
          .select({ day: journalEntries.day, body: journalEntries.body })
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.userId, userId),
              inArray(journalEntries.day, days),
            ),
          )
      : [],
    personIds.length
      ? db
          .select({ id: people.id, name: people.name })
          .from(people)
          .where(and(eq(people.userId, userId), inArray(people.id, personIds)))
      : [],
  ]);
  const byKey = new Map<string, RelatedItem>();
  for (const row of personRows) {
    byKey.set(`person:${row.id}`, {
      edgeId: "",
      kind: "person",
      id: row.id,
      label: row.name,
      href: `/people/${row.id}`,
      detail: null,
      completed: false,
    });
  }
  for (const row of taskRows) {
    byKey.set(`task:${row.id}`, {
      edgeId: "",
      kind: "task",
      id: row.id,
      label: row.name,
      href: taskHref(row.id),
      detail: row.areaName,
      completed: row.status === "completed",
    });
  }
  for (const row of noteRows) {
    byKey.set(`note:${row.id}`, {
      edgeId: "",
      kind: "note",
      id: row.id,
      label: row.title,
      href: noteHref(row.notebookId, row.id),
      detail: row.notebookName ?? "No notebook",
      completed: false,
    });
  }
  for (const row of dayRows) {
    if (!row.body.trim()) continue;
    byKey.set(`journal:${row.day}`, {
      edgeId: "",
      kind: "journal",
      id: row.day,
      label: formatJournalDay(row.day),
      href: `/journal/${row.day}`,
      detail: null,
      completed: false,
    });
  }
  return edges.flatMap((edge) => {
    const item = byKey.get(`${edge.kind}:${edge.id}`);
    return item ? [{ ...item, edgeId: edge.edgeId }] : [];
  });
}

async function edgesFrom(
  db: Db,
  userId: string,
  end: LinkEnd,
  direction: "outgoing" | "incoming",
) {
  const source = direction === "outgoing";
  const rows = await db
    .select({
      edgeId: entityLinks.id,
      kind: source ? entityLinks.targetType : entityLinks.sourceType,
      id: source ? entityLinks.targetId : entityLinks.sourceId,
    })
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.userId, userId),
        eq(source ? entityLinks.sourceType : entityLinks.targetType, end.kind),
        eq(source ? entityLinks.sourceId : entityLinks.targetId, end.id),
      ),
    )
    .orderBy(desc(entityLinks.createdAt), desc(entityLinks.id));
  return showEnds(db, userId, rows);
}

export async function related(
  userId: string,
  end: LinkEnd,
  db: Db = defaultDb,
): Promise<RelatedLists> {
  const parsed = parseEnd(end);
  if (!isUuid(userId) || !parsed) return { outgoing: [], incoming: [] };
  const [outgoing, incoming] = await Promise.all([
    edgesFrom(db, userId, parsed, "outgoing"),
    edgesFrom(db, userId, parsed, "incoming"),
  ]);
  return { outgoing, incoming };
}

type SearchRow = {
  kind: LinkKind;
  id: string;
  label: string;
  detail: string;
  completed: boolean;
};

function likePattern(query: string) {
  return `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export async function searchLinkTargets(
  userId: string,
  input: { query: string; offset: number; today: string; exclude: LinkEnd },
  db: Db = defaultDb,
): Promise<{ hits: PickerHit[]; more: boolean }> {
  const exclude = parseEnd(input.exclude);
  if (!isUuid(userId) || !exclude) return { hits: [], more: false };
  const query = input.query.trim().slice(0, 200);
  const start =
    Number.isSafeInteger(input.offset) && input.offset >= 0
      ? Math.min(input.offset, 10_000)
      : 0;
  const today = isCalendarDay(input.today) ? input.today : "1970-01-01";
  const pattern = likePattern(query);
  const statement = sql`
    select kind, id, label, detail, completed from (
      select 'task'::text as kind, tasks.id::text as id, tasks.name as label, areas.name as detail,
             (tasks.completed_at is not null) as completed
      from tasks
      inner join areas on areas.id = tasks.area_id
      where areas.user_id = ${userId}::uuid
        and tasks.name ilike ${pattern} escape '\\'
        and not (${exclude.kind} = 'task' and tasks.id::text = ${exclude.id})
      union all
      select 'note'::text, notes.id::text, notes.title, coalesce(notebooks.name, 'No notebook'), false
      from notes
      left join notebooks on notebooks.id = notes.notebook_id
      where notes.user_id = ${userId}::uuid
        and notes.title ilike ${pattern} escape '\\'
        and not (${exclude.kind} = 'note' and notes.id::text = ${exclude.id})
      union all
      select 'person'::text, people.id::text, people.name, ''::text, false
      from people
      where people.user_id = ${userId}::uuid
        and people.name ilike ${pattern} escape '\\'
        and not (${exclude.kind} = 'person' and people.id::text = ${exclude.id})
      union all
      select 'journal'::text, journal_entries.day::text, journal_entries.day::text, ''::text, false
      from journal_entries
      where journal_entries.user_id = ${userId}::uuid
        and ${isCalendarDay(input.today)}
        and btrim(journal_entries.body) <> ''
        and journal_entries.day <= ${today}::date
        and (
          journal_entries.day::text ilike ${pattern} escape '\\'
          or to_char(journal_entries.day, 'FMDay, FMMon FMDD, YYYY') ilike ${pattern} escape '\\'
        )
        and not (${exclude.kind} = 'journal' and journal_entries.day::text = ${exclude.id})
    ) hits
    order by label asc, kind asc, id asc
    limit ${linkPageSize + 1} offset ${start}
  `;
  const result = await (
    db as Db & { execute: (query: SQL) => Promise<{ rows: SearchRow[] }> }
  ).execute(statement);
  const rows = result.rows;
  const more = rows.length > linkPageSize;
  const hits = rows.slice(0, linkPageSize).flatMap((row): PickerHit[] => {
    const end = linkEnd(row.kind, row.id);
    if (!end) return [];
    if (end.kind === "journal") {
      return [
        {
          kind: "journal",
          id: end.id,
          label: formatJournalDay(end.id),
          detail: null,
          completed: false,
        },
      ];
    }
    return [
      {
        kind: end.kind,
        id: end.id,
        label: row.label,
        detail: row.detail || null,
        completed: row.completed === true,
      },
    ];
  });
  return { hits, more };
}

export async function deleteEdgesForNotes(
  tx: Db,
  userId: string,
  noteIds: readonly string[],
) {
  const ids = noteIds.filter((id) => isUuid(id));
  if (!isUuid(userId) || !ids.length) return;
  await tx
    .delete(entityLinks)
    .where(
      and(
        eq(entityLinks.userId, userId),
        or(
          and(
            eq(entityLinks.sourceType, "note"),
            inArray(entityLinks.sourceId, ids),
          ),
          and(
            eq(entityLinks.targetType, "note"),
            inArray(entityLinks.targetId, ids),
          ),
        ),
      ),
    );
}
