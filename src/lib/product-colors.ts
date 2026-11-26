/** Semantic colors remain CSS values so theme changes do not require a refetch. */
export function colorWithAlpha(color: string | null | undefined, percent = 10): string {
  return `color-mix(in oklab, ${color || "var(--muted-foreground)"} ${percent}%, transparent)`;
}
export function colorGradient(color: string | null | undefined, percent = 8, end = "70%") {
  return `linear-gradient(135deg, ${colorWithAlpha(color, percent)}, transparent ${end})`;
}
export const itemColor = (type?: string | null): string =>
  type && Object.hasOwn(itemColorTokens, type) ? `var(--type-${type})` : "var(--muted-foreground)";
export const itemColorTokens: Record<string, number> = {
  task: 1, note: 4, journal: 5, habit: 2, event: 3, finance: 2, contact: 3,
  idea: 5, goal: 1, document: 3, bookmark: 3, milestone: 1, routine: 4,
  symptom: 1, medication: 1, affirmation: 5, vision: 5,
};
export const domainColorTokens: Record<string, number> = {
  mind_soul: 5, time_action: 1, health: 1, wealth: 2, network: 3, growth: 3, creativity: 5, admin: 4,
};

/** Persisted overrides are portable hex colors; arbitrary CSS is never stored by project forms. */
export function isProjectColor(value: unknown): value is string {
  return typeof value === "string" && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
}
export type ColorDomain = { key?: string | null; color?: string | null };
export function domainColor(domain?: ColorDomain | null): string {
  return domain?.key && Object.hasOwn(domainColorTokens, domain.key)
    ? `var(--domain-${domain.key.replaceAll("_", "-")})`
    : isProjectColor(domain?.color) ? domain.color : "var(--primary)";
}
export type ColorProject = { color?: string | null; domain?: ColorDomain | null };
export function projectColor(project?: ColorProject | null, type?: string | null): string {
  if (isProjectColor(project?.color)) return project.color;
  if (project?.domain?.key && Object.hasOwn(domainColorTokens, project.domain.key)) return domainColor(project.domain);
  if (type && Object.hasOwn(itemColorTokens, type)) return itemColor(type);
  return "var(--primary)";
}
