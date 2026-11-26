import type { ItemRecord, Workspace } from "./client-model";

const WORD = /[^\p{L}\p{N}]+/u;
const HEALTH_WORDS = new Set([
  "medication",
  "medications",
  "medicine",
  "medicines",
  "prescription",
  "prescriptions",
  "symptom",
  "symptoms",
  "diagnosis",
  "diagnoses",
  "allergy",
  "allergies",
  "dosage",
  "dosages",
  "health",
]);

export type LinkAccept = {
  kind: "link";
  fromId: string;
  toId: string;
  type: "mentions" | "related_to";
  fromRevision: number;
  toRevision: number;
};
export type AreaAccept = {
  kind: "area";
  itemId: string;
  tagId: string;
  revision: number;
};
export type MomentAccept = {
  kind: "moment";
  momentId: string;
  itemId: string;
  relation: "mention" | "located_at";
  revision: number;
};
export type ProjectAccept = {
  kind: "project";
  itemId: string;
  projectId: string;
  revision: number;
};
export type LinkProposal = {
  id: string;
  confidence: "proposal" | "suggestion";
  title: string;
  reason: string;
  acceptLabel: string;
  rejectLabel: string;
  momentId?: string;
  itemIds: string[];
  accept: LinkAccept | AreaAccept | MomentAccept | ProjectAccept;
};

export type ProposalScope = {
  itemIds?: readonly string[];
  momentIds?: readonly string[];
};

/**
 * Derived cards only. Explicit mention selectors and Project saves stay immediate
 * writes. These cards describe the canonical record Accept will create.
 */
export class LinkProposals {
  static readonly acceptance = [
    {
      case: "journal-person-mention",
      canonical: "MomentItem mention",
      evidence:
        "Journal text contains an existing Person name and that mention is not stored",
      write: "V1.relateMoment",
    },
    {
      case: "gps-place",
      canonical: "MomentItem located_at",
      evidence:
        "This capture stored coordinates and capturedMomentId on the Place it filed",
      write: "V1.relateMoment",
    },
    {
      case: "task-in-project",
      canonical: "Item.projectId",
      evidence:
        "A checklist parent in a Project links to a Task that has no Project",
      write: "V1.placeTask",
    },
    {
      case: "health-note",
      canonical: "Link related_to",
      evidence: "A Note contains a whole health word",
      write: "V1.createLink",
    },
    {
      case: "area-inheritance",
      canonical: "ItemTag area",
      evidence: "An Item inherits a Project Area it does not have directly",
      write: "V1.updateItem",
    },
    {
      case: "me-related-note",
      canonical: "Link related_to",
      evidence:
        "A Note without a health word is filed on a Journal entry that mentions Me",
      write: "V1.createLink",
    },
  ] as const;

  static capturedPlace(metadata: unknown, momentId: string) {
    if (!metadata || typeof metadata !== "object") return false;
    const place = metadata as Record<string, unknown>;
    return (
      place.category === "place" &&
      place.capturedMomentId === momentId &&
      typeof place.latitude === "number" &&
      typeof place.longitude === "number"
    );
  }

  static namesPerson(text: string, title: string) {
    const phrase = title.toLocaleLowerCase().split(WORD).filter(Boolean);
    if (!phrase.length || phrase.join("") === "me" || phrase.join("").length < 2)
      return false;
    const tokens = text.toLocaleLowerCase().split(WORD).filter(Boolean);
    return tokens.some((_, index) =>
      phrase.every((part, offset) => tokens[index + offset] === part),
    );
  }

  static infer(workspace: Workspace) {
    const cards: LinkProposal[] = [];
    const me = LinkProposals.me(workspace.items);
    for (const moment of workspace.moments) {
      const mentioned = new Set(
        moment.items
          .filter((ref) => ref.relation === "mention")
          .map((ref) => ref.itemId),
      );
      const recorded = LinkProposals.unique(
        moment.items
          .filter((ref) => ref.relation === "reference")
          .map((ref) => LinkProposals.active(workspace.items, ref.itemId))
          .filter((item): item is ItemRecord => !!item),
      );
      for (const person of workspace.items) {
        if (
          person.type !== "person" ||
          person.status === "archived" ||
          mentioned.has(person.id) ||
          !LinkProposals.namesPerson(moment.text, person.title)
        )
          continue;
        cards.push({
          id: `journal-mention:${moment.id}:${person.id}`,
          confidence: "proposal",
          momentId: moment.id,
          itemIds: [person.id],
          title: `Journal mention of “${person.title}”`,
          reason: `This Journal entry names ${person.title}, and that mention is not stored yet. Accepting records a Journal mention. Rejecting writes nothing. Choosing the person while capturing still saves the mention immediately.`,
          acceptLabel: `Accept journal mention of ${person.title}`,
          rejectLabel: `Reject journal mention of ${person.title}`,
          accept: {
            kind: "moment",
            momentId: moment.id,
            itemId: person.id,
            relation: "mention",
            revision: moment.revision,
          },
        });
      }
      for (const source of recorded) {
        for (const personId of mentioned) {
          const person = LinkProposals.active(workspace.items, personId);
          if (!person || person.type !== "person" || source.id === person.id)
            continue;
          if (
            LinkProposals.hasLink(workspace, source.id, person.id, "mentions")
          )
            continue;
          cards.push({
            id: `mention:${moment.id}:${source.id}:${person.id}`,
            confidence: "proposal",
            momentId: moment.id,
            itemIds: [source.id, person.id],
            title: `“${source.title}” mentions “${person.title}”`,
            reason: `This Journal entry mentions ${person.title} and records ${source.title}. Accepting creates a mentions Link from “${source.title}” to “${person.title}”. Rejecting writes nothing and leaves the Journal mention in place.`,
            acceptLabel: `Accept mentions link for ${source.title}`,
            rejectLabel: `Reject mentions link for ${source.title}`,
            accept: {
              kind: "link",
              fromId: source.id,
              toId: person.id,
              type: "mentions",
              fromRevision: source.revision,
              toRevision: person.revision,
            },
          });
        }
        if (
          source.type === "bookmark" &&
          LinkProposals.capturedPlace(source.metadata, moment.id) &&
          !moment.items.some(
            (ref) =>
              ref.relation === "located_at" && ref.itemId === source.id,
          )
        )
          cards.push({
            id: `located:${moment.id}:${source.id}`,
            confidence: "proposal",
            momentId: moment.id,
            itemIds: [source.id],
            title: `This entry was captured at “${source.title}”`,
            reason: `This Journal entry filed “${source.title}” from Use my location. Accepting records that this entry was captured at that Place. It does not place Me there. Rejecting writes nothing. The Place itself stays saved.`,
            acceptLabel: `Accept location for ${source.title}`,
            rejectLabel: `Reject location for ${source.title}`,
            accept: {
              kind: "moment",
              momentId: moment.id,
              itemId: source.id,
              relation: "located_at",
              revision: moment.revision,
            },
          });
      }
      if (me && mentioned.has(me.id))
        for (const note of recorded) {
          if (note.type !== "note" || note.id === me.id) continue;
          if (LinkProposals.healthToken(note.title, note.content)) continue;
          if (
            LinkProposals.hasLink(workspace, note.id, me.id, "related_to", true)
          )
            continue;
          cards.push({
            id: `me-note:${note.id}:${me.id}`,
            confidence: "suggestion",
            momentId: moment.id,
            itemIds: [note.id, me.id],
            title: `Relate “${note.title}” to Me`,
            reason: `Suggestion only. “${note.title}” was recorded on a Journal entry that mentions Me. Accepting creates a related_to Link to Me. Rejecting writes nothing.`,
            acceptLabel: `Accept Me relation for ${note.title}`,
            rejectLabel: `Reject Me relation for ${note.title}`,
            accept: {
              kind: "link",
              fromId: note.id,
              toId: me.id,
              type: "related_to",
              fromRevision: note.revision,
              toRevision: me.revision,
            },
          });
        }
    }
    if (me)
      for (const note of workspace.items) {
        if (note.type !== "note" || note.status === "archived" || note.id === me.id)
          continue;
        const word = LinkProposals.healthToken(note.title, note.content);
        if (!word) continue;
        if (LinkProposals.hasLink(workspace, note.id, me.id, "related_to", true))
          continue;
        cards.push({
          id: `health:${note.id}:${me.id}`,
          confidence: "suggestion",
          itemIds: [note.id, me.id],
          title: `Link “${note.title}” to Me`,
          reason: `Suggestion only. “${note.title}” contains the word “${word}”. Accepting creates a related_to Link to Me. Rejecting writes nothing.`,
          acceptLabel: `Accept link to Me for ${note.title}`,
          rejectLabel: `Reject link to Me for ${note.title}`,
          accept: {
            kind: "link",
            fromId: note.id,
            toId: me.id,
            type: "related_to",
            fromRevision: note.revision,
            toRevision: me.revision,
          },
        });
      }
    for (const child of workspace.items) {
      if (child.type !== "task" || child.status === "archived" || child.projectId)
        continue;
      const parents = workspace.items.filter(
        (parent) =>
          parent.type === "task" &&
          parent.id !== child.id &&
          !!parent.projectId &&
          parent.content.includes(`/app/library/${child.id}`),
      );
      const projectIds = [...new Set(parents.map((parent) => parent.projectId))];
      if (projectIds.length !== 1 || !projectIds[0]) continue;
      const project =
        parents.find((parent) => parent.project)?.project ??
        workspace.projects.find((entry) => entry.id === projectIds[0]);
      if (!project) continue;
      const parent = parents[0];
      cards.push({
        id: `project:${child.id}:${project.id}`,
        confidence: "suggestion",
        itemIds: [child.id],
        title: `Place “${child.title}” in “${project.name}”`,
        reason: `Suggestion only. “${child.title}” was promoted from “${parent.title},” which is in Project “${project.name}.” Accepting places this Task in that Project. Rejecting writes nothing. Choosing a Project in the editor still saves immediately.`,
        acceptLabel: `Accept Project ${project.name} for ${child.title}`,
        rejectLabel: `Reject Project ${project.name} for ${child.title}`,
        accept: {
          kind: "project",
          itemId: child.id,
          projectId: project.id,
          revision: child.revision,
        },
      });
    }
    for (const item of workspace.items) {
      if (item.status === "archived" || !item.project) continue;
      const direct = new Set(item.directAreas.map((area) => area.id));
      for (const area of item.inheritedAreas) {
        if (direct.has(area.id)) continue;
        cards.push({
          id: `area:${item.id}:${area.id}`,
          confidence: "suggestion",
          itemIds: [item.id],
          title: `Assign Area “${area.name}”`,
          reason: `Suggestion only. “${item.title}” inherits Area “${area.name}” from Project “${item.project.name}”. Accepting assigns that Area on this Item. Rejecting writes nothing. The Area still shows as inherited.`,
          acceptLabel: `Accept Area ${area.name} on ${item.title}`,
          rejectLabel: `Reject Area ${area.name} on ${item.title}`,
          accept: {
            kind: "area",
            itemId: item.id,
            tagId: area.id,
            revision: item.revision,
          },
        });
      }
    }
    const seen = new Set<string>();
    return cards
      .filter((card) => (seen.has(card.id) ? false : (seen.add(card.id), true)))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  static forContext(
    workspace: Workspace,
    scope: { momentId?: string; itemId?: string },
    proposals: readonly LinkProposal[] = LinkProposals.infer(workspace),
  ) {
    return proposals.filter((card) =>
      scope.momentId
        ? card.momentId === scope.momentId
        : scope.itemId
          ? card.itemIds.includes(scope.itemId)
          : false,
    );
  }

  static forScope(workspace: Workspace, scope: ProposalScope, proposals: readonly LinkProposal[] = LinkProposals.infer(workspace)) {
    const items = new Set(scope.itemIds);
    const moments = new Set(scope.momentIds);
    return proposals.filter(
      (card) =>
        (card.momentId && moments.has(card.momentId)) ||
        card.itemIds.some((id) => items.has(id)),
    );
  }

  /** Reject is a local decision. It has no service call and no ledger row. */
  static reject() {
    return { writes: false as const };
  }

  private static me(items: ItemRecord[]) {
    return (
      items.find(
        (item) =>
          !!item.selfProfile &&
          item.type === "person" &&
          item.status !== "archived",
      ) ?? null
    );
  }
  private static active(items: ItemRecord[], id: string) {
    const item = items.find((entry) => entry.id === id);
    if (!item || item.status === "archived") return null;
    return item;
  }
  private static unique(items: ItemRecord[]) {
    return [...new Map(items.map((item) => [item.id, item])).values()];
  }
  private static hasLink(
    workspace: Workspace,
    fromId: string,
    toId: string,
    type: string,
    either = false,
  ) {
    return workspace.links.some(
      (link) =>
        link.type === type &&
        ((link.fromId === fromId && link.toId === toId) ||
          (either && link.fromId === toId && link.toId === fromId)),
    );
  }
  private static healthToken(title: string, content: string) {
    for (const word of `${title}\n${content}`
      .toLocaleLowerCase()
      .split(WORD)) {
      if (HEALTH_WORDS.has(word)) return word;
    }
    return null;
  }
}
