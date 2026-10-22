import { randomUUID } from 'node:crypto';
import { db as defaultDb, people, notes, entityLinks, habitOperations } from '@repo/db';
import { noteName, validNoteBody, validNoteOccasionDate } from '@repo/domain';
import { and, eq, or, desc, sql } from 'drizzle-orm';
import { type Db, isUuid } from './db.ts';
import { NoteError } from './notes.ts';
export type PersonNoteInput = { personId: string; text: string; occasionDate?: string | null; today: string; operationId: string };
export type PersonNoteResult = { id: string; name: string; title: string; occasionDate: string | null };

// Caller owns the transaction, including any Inbox archive. The ledger retains
// the original receipt even if either endpoint is later edited or deleted.
export async function logNoteOnPersonInTransaction(userId: string, input: PersonNoteInput, tx: Db): Promise<PersonNoteResult> {
  if (!isUuid(input.personId) || !input.operationId || input.operationId.length > 250) throw new NoteError('That person is unavailable. Refresh and try again.');
  const source = 'person-note';
  // A unique claim serializes concurrent resends without requiring a new table.
  const id = randomUUID();
  const [claim] = await tx.insert(habitOperations).values({userId, source, operationId:input.operationId, habitId:id, result:{}}).onConflictDoNothing().returning();
  if (!claim) {
    const [existing] = await tx.select().from(habitOperations).where(and(eq(habitOperations.userId,userId),eq(habitOperations.source,source),eq(habitOperations.operationId,input.operationId)));
    if (!existing) throw new NoteError('Could not log this note.');
    return existing.result as PersonNoteResult;
  }
  const lines = input.text.replace(/\r\n?/g,'\n').split('\n');
  const first = lines.findIndex(line=>line.trim());
  const title = noteName(lines[first] ?? '');
  const body = lines.slice(first + 1).join('\n');
  if (!title || !validNoteBody(body)) throw new NoteError('Use a first line of 1–200 characters and a body of at most 100,000 characters.');
  if (input.occasionDate != null && !validNoteOccasionDate(input.occasionDate,input.today)) throw new NoteError('Occasion date must be today or a past day.');
  const [person] = await tx.select().from(people).where(and(eq(people.userId,userId),eq(people.id,input.personId))).for('update');
  if (!person) throw new NoteError('That person is unavailable. Refresh and try again.');
  await tx.insert(notes).values({id,userId,title,body,notebookId:null,occasionDate:input.occasionDate ?? null});
  await tx.insert(entityLinks).values({userId,sourceType:'person',sourceId:person.id,targetType:'note',targetId:id});
  const result = {id,name:person.name,title,occasionDate:input.occasionDate ?? null};
  await tx.update(habitOperations).set({result}).where(eq(habitOperations.id,claim.id));
  return result;
}
export async function logNoteOnPerson(userId: string, input: PersonNoteInput, db: Db = defaultDb) {
  return db.transaction(tx=>logNoteOnPersonInTransaction(userId,input,tx));
}
export async function personLinkedNotes(userId: string, personId: string, db: Db = defaultDb) {
  if (!isUuid(personId)) return [];
  const rows = await db.select({id:notes.id,title:notes.title,occasionDate:notes.occasionDate,body:sql<string>`left(${notes.body}, 2000)`}).from(entityLinks)
    .innerJoin(notes, or(and(eq(entityLinks.targetType,'note'),sql`${entityLinks.targetId} = ${notes.id}::text`),and(eq(entityLinks.sourceType,'note'),sql`${entityLinks.sourceId} = ${notes.id}::text`))!)
    .innerJoin(people,eq(people.id,personId))
    .where(and(eq(entityLinks.userId,userId),eq(notes.userId,userId),eq(people.userId,userId),or(and(eq(entityLinks.sourceType,'person'),eq(entityLinks.sourceId,personId)),and(eq(entityLinks.targetType,'person'),eq(entityLinks.targetId,personId)))))
    .orderBy(desc(entityLinks.createdAt),desc(entityLinks.id)).limit(20);
  return rows.map(row=>({...row,body:row.body.slice(0,2000)}));
}
