import type { Workspace } from "./client-model";
import { LinkProposals, type ProposalScope, type LinkProposal } from "./link-proposals";

export type PerspectiveScope = ProposalScope & {
  projectIds?: readonly string[];
};
export type PerspectiveGap = {
  id: string;
  recordId: string;
  title: string;
  kind: "link" | "moment" | "project";
};

/** Affordances derived from the visible canonical records, never saved view data. */
export function perspectiveGaps(
  data: Workspace,
  scope: PerspectiveScope,
  inferred: readonly LinkProposal[] = LinkProposals.infer(data),
): PerspectiveGap[] {
  const proposals = LinkProposals.forScope(data, scope, inferred);
  const coveredItems = new Set(proposals.flatMap((card) => card.itemIds));
  const coveredMoments = new Set(
    proposals.flatMap((card) => (card.momentId ? [card.momentId] : [])),
  );
  const active = data.items.filter((item) => item.status !== "archived");
  const itemIds = new Set(scope.itemIds);
  const momentIds = new Set(scope.momentIds);
  const projectIds = new Set(scope.projectIds);
  return [
    ...active
      .filter(
        (item) =>
          itemIds.has(item.id) &&
          !coveredItems.has(item.id) &&
          active.some((other) => other.id !== item.id) &&
          !data.links.some(
            (link) => link.fromId === item.id || link.toId === item.id,
          ),
      )
      .map((item) => ({
        id: `link:${item.id}`,
        recordId: item.id,
        kind: "link" as const,
        title: `Connect ${item.title}`,
      })),
    ...data.moments
      .filter(
        (moment) =>
          momentIds.has(moment.id) &&
          !coveredMoments.has(moment.id) &&
          !moment.items.length,
      )
      .map((moment) => ({
        id: `moment:${moment.id}`,
        recordId: moment.id,
        kind: "moment" as const,
        title: `Connect Journal entry: ${moment.text.slice(0, 80)}`,
      })),
    ...data.projects
      .filter(
        (project) =>
          projectIds.has(project.id) &&
          project.status !== "archived" &&
          active.some(
            (item) =>
              item.type === "task" && item.status !== "done" && !item.projectId,
          ),
      )
      .map((project) => ({
        id: `project:${project.id}`,
        recordId: project.id,
        kind: "project" as const,
        title: `Place a Task in ${project.name}`,
      })),
  ];
}
