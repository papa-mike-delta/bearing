import { linkEnd, type LinkEnd, type RelatedLists } from "@repo/domain";
import type { Db } from "./db.ts";
import { addLink, related, removeLink, searchLinkTargets } from "./links.ts";

// Keep the auth/cache boundary injectable, as with peopleActions.
export function relatedActions(ports: {
  requireUser: () => Promise<{ id: string }>;
  refresh: (end: LinkEnd) => void;
  db: Db;
}) {
  async function createLink(
    sourceKind: unknown,
    sourceId: unknown,
    targetKind: unknown,
    targetId: unknown,
    today: string,
  ): Promise<{ related: RelatedLists; exists: boolean } | { error: string }> {
    const user = await ports.requireUser();
    const source = linkEnd(sourceKind, sourceId);
    const target = linkEnd(targetKind, targetId);
    if (!source || !target) return { error: "That item is unavailable." };
    const result = await addLink(user.id, source, target, today, ports.db);
    if (!result.ok) {
      return {
        error:
          result.reason === "self"
            ? "A link can't point at the same item."
            : "That item is unavailable.",
      };
    }
    ports.refresh(source);
    ports.refresh(target);
    return {
      related: await related(user.id, source, ports.db),
      exists: !result.created,
    };
  }

  async function deleteLink(
    edgeId: string,
    sourceKind: unknown,
    sourceId: unknown,
  ): Promise<{ related: RelatedLists } | { error: string }> {
    const user = await ports.requireUser();
    const source = linkEnd(sourceKind, sourceId);
    if (!source) return { error: "That item is unavailable." };
    const result = await removeLink(user.id, edgeId, source, ports.db);
    if (!result.ok) return { error: "That item is unavailable." };
    ports.refresh(source);
    const target = linkEnd(result.targetType, result.targetId);
    if (target) ports.refresh(target);
    return { related: await related(user.id, source, ports.db) };
  }

  async function findLinkTargets(
    query: string,
    offset: number,
    today: string,
    sourceKind: unknown,
    sourceId: unknown,
  ) {
    const user = await ports.requireUser();
    const source = linkEnd(sourceKind, sourceId);
    if (!source) return { hits: [], more: false };
    return searchLinkTargets(
      user.id,
      { query, offset, today, exclude: source },
      ports.db,
    );
  }

  return { createLink, deleteLink, findLinkTargets };
}
