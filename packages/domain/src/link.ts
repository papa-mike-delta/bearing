import { isCalendarDay } from "./areas.ts";

export const linkKinds = ["task", "note", "journal"] as const;
export type LinkKind = (typeof linkKinds)[number];
export const linkPageSize = 20;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LinkEnd = { kind: LinkKind; id: string };

export type RelatedItem = {
  edgeId: string;
  kind: LinkKind;
  id: string;
  label: string;
  href: string;
  detail: string | null;
  completed: boolean;
};

export type RelatedLists = {
  outgoing: RelatedItem[];
  incoming: RelatedItem[];
};

export type PickerHit = {
  kind: LinkKind;
  id: string;
  label: string;
  detail: string | null;
  completed: boolean;
};

export function isLinkKind(value: unknown): value is LinkKind {
  return (linkKinds as readonly unknown[]).includes(value);
}

export function taskHref(taskId: string) {
  return `/tasks/item/${taskId}`;
}

export function linkEnd(kind: unknown, id: unknown): LinkEnd | null {
  if (!isLinkKind(kind) || typeof id !== "string") return null;
  if (kind === "journal") return isCalendarDay(id) ? { kind, id } : null;
  return uuid.test(id) ? { kind, id: id.toLowerCase() } : null;
}

export function isSelfLink(source: LinkEnd, target: LinkEnd) {
  return source.kind === target.kind && source.id === target.id;
}
