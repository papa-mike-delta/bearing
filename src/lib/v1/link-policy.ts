/** Semantic relations only; Project/Tag membership is represented by foreign keys. */
export function validLinkEndpoints(
  type: string,
  from: { type: string },
  to: { type: string; metadata: unknown },
) {
  if (type === "advances")
    return (
      ["task", "habit", "note", "event", "goal"].includes(from.type) &&
      to.type === "goal"
    );
  if (type === "tracks") return from.type === "goal" && to.type === "habit";
  if (type === "scheduled_at")
    return from.type !== "event" && to.type === "event";
  if (type === "located_at")
    return (
      to.type === "bookmark" &&
      (to.metadata as { category?: string })?.category === "place"
    );
  return type === "related_to" || type === "mentions";
}
