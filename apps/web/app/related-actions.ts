"use server";

import { type LinkEnd } from "@repo/domain";
import { revalidatePath } from "next/cache";
import { requireUser } from "../auth";
import { relatedActions } from "../lib/related-actions";
import { db } from "@repo/db";

function refresh(end: LinkEnd) {
  if (end.kind === "task") {
    revalidatePath("/");
    revalidatePath(`/tasks/item/${end.id}`);
  } else if (end.kind === "note") revalidatePath("/notes", "layout");
  else if (end.kind === "person") revalidatePath(`/people/${end.id}`);
  else revalidatePath(`/journal/${end.id}`);
}

const actions = relatedActions({ db, requireUser, refresh });

export async function createLink(
  sourceKind: unknown,
  sourceId: unknown,
  targetKind: unknown,
  targetId: unknown,
  today: string,
) {
  return actions.createLink(sourceKind, sourceId, targetKind, targetId, today);
}
export async function deleteLink(
  edgeId: string,
  sourceKind: unknown,
  sourceId: unknown,
) {
  return actions.deleteLink(edgeId, sourceKind, sourceId);
}
export async function findLinkTargets(
  query: string,
  offset: number,
  today: string,
  sourceKind: unknown,
  sourceId: unknown,
) {
  return actions.findLinkTargets(query, offset, today, sourceKind, sourceId);
}
