import { itemColor, projectColor } from "@/lib/product-colors";
/** Shared projections: these never create a second Item or imply an interaction. */
import { dateInZone } from "./dates";
import type { ItemRecord, Workspace } from "./client-model";
export function habitPeriod(
  at: string | Date,
  timezone: string,
  cadence: string,
) {
  const day = dateInZone(at, timezone);
  if (cadence === "monthly") return day.slice(0, 7);
  if (cadence === "weekly") {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  return day;
}
export function navigationUrl(metadata: Record<string, any>) {
  const destination =
    metadata.latitude != null && metadata.longitude != null
      ? `${metadata.latitude},${metadata.longitude}`
      : metadata.address;
  return destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
    : null;
}
export function personContext(data: Workspace, personId: string) {
  const ids = new Set(
    data.links.flatMap((l) =>
      l.fromId === personId ? [l.toId] : l.toId === personId ? [l.fromId] : [],
    ),
  );
  return {
    linked: data.items.filter(
      (i) => ids.has(i.id) || i.delegateId === personId,
    ),
    mentions: data.moments.filter((m) =>
      m.items.some((r) => r.itemId === personId),
    ),
    interactions: data.activities.filter(
      (a) => a.itemId === personId && a.kind === "interaction",
    ),
    followUps: data.items.filter(
      (i) =>
        i.type === "task" &&
        i.status !== "done" &&
        i.status !== "archived" &&
        (i.delegateId === personId || ids.has(i.id)) &&
        !!i.followUpAt,
    ),
  };
}
export function graphData(data: Workspace) {
  const nodes = [
    ...data.items.map((i) => ({
      id: i.id,
      kind: "item" as const,
      type: i.type,
      title: i.title,
      status: i.status,
      color: itemColor(i.type === "person" ? "contact" : i.type),
    })),
    ...data.projects.map((p) => ({
      id: p.id,
      kind: "project" as const,
      type: "project",
      title: p.name,
      status: p.status,
      color: projectColor(),
    })),
  ];
  const edges = [
    ...data.links.map((l) => ({
      id: l.id,
      source: l.fromId,
      target: l.toId,
      type: l.type,
      kind: "link" as const,
    })),
    ...data.items
      .filter((i) => i.projectId)
      .map((i) => ({
        id: `project:${i.id}`,
        source: i.id,
        target: i.projectId!,
        type: "project",
        kind: "project" as const,
      })),
  ];
  return { nodes, edges };
}
export function upcomingDates(items: ItemRecord[], today: string) {
  return items
    .filter((i) => i.type === "person" && i.status !== "archived")
    .flatMap((person) => {
      const m = person.metadata as Record<string, any>;
      const dates = [
        ...(m.importantDates || []),
        ...(m.birthday ? [{ label: "Birthday", date: m.birthday }] : []),
      ];
      return dates.flatMap((entry: { label: string; date: string }) => {
        let date = `${today.slice(0, 4)}${entry.date.slice(4)}`;
        if (date < today)
          date = `${+today.slice(0, 4) + 1}${entry.date.slice(4)}`;
        const days = (Date.parse(date) - Date.parse(today)) / 86400000;
        return days <= 30 ? [{ person, label: entry.label, date }] : [];
      });
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
