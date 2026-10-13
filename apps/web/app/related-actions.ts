"use server";

import { linkEnd, type LinkEnd, type RelatedLists } from "@repo/domain";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { addLink, related, removeLink, searchLinkTargets } from "../lib/links";

function refresh(end: LinkEnd) {
  if (end.kind === "task") {
    revalidatePath("/");
    revalidatePath(`/tasks/item/${end.id}`);
  } else if (end.kind === "note") revalidatePath("/notes", "layout");
  else revalidatePath(`/journal/${end.id}`);
}

export async function createLink(
  sourceKind: unknown,
  sourceId: unknown,
  targetKind: unknown,
  targetId: unknown,
  today: string,
): Promise<{ related: RelatedLists; exists: boolean } | { error: string }> {
  const user = await requireUser();
  const source = linkEnd(sourceKind, sourceId);
  const target = linkEnd(targetKind, targetId);
  if (!source || !target) return { error: "That item is unavailable." };
  const result = await addLink(user.id, source, target, today);
  if (!result.ok) {
    return {
      error:
        result.reason === "self"
          ? "A link can't point at the same item."
          : "That item is unavailable.",
    };
  }
  refresh(source);
  refresh(target);
  return { related: await related(user.id, source), exists: !result.created };
}

export async function deleteLink(
  edgeId: string,
  sourceKind: unknown,
  sourceId: unknown,
): Promise<{ related: RelatedLists } | { error: string }> {
  const user = await requireUser();
  const source = linkEnd(sourceKind, sourceId);
  if (!source) return { error: "That item is unavailable." };
  const result = await removeLink(user.id, edgeId, source);
  if (!result.ok) return { error: "That item is unavailable." };
  refresh(source);
  const target = linkEnd(result.targetType, result.targetId);
  if (target) refresh(target);
  return { related: await related(user.id, source) };
}

export async function findLinkTargets(
  query: string,
  offset: number,
  today: string,
  sourceKind: unknown,
  sourceId: unknown,
) {
  const user = await requireUser();
  const source = linkEnd(sourceKind, sourceId);
  if (!source) return { hits: [], more: false };
  return searchLinkTargets(user.id, { query, offset, today, exclude: source });
}
