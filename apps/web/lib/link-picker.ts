import type { PickerHit } from "@repo/domain";

export function matchesQuery(
  hit: Pick<PickerHit, "kind" | "id" | "label">,
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (hit.label.toLowerCase().includes(needle)) return true;
  // Journal days also match their ISO date, as the server search does.
  return hit.kind === "journal" && hit.id.includes(needle);
}

export function acceptResponse(latestId: number, responseId: number) {
  return responseId === latestId;
}
