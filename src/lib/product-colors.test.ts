import { expect, it } from "vitest";
import { colorWithAlpha, colorGradient, domainColor, itemColor, isProjectColor, projectColor } from "./product-colors";

it("resolves explicit project override, owning domain, Item type, then primary", () => {
  expect(projectColor({ color: "#123456", domain: { key: "health" } }, "task")).toBe("#123456");
  expect(projectColor({ color: null, domain: { key: "health" } }, "task")).toBe("var(--domain-health)");
  expect(projectColor({ color: null }, "task")).toBe("var(--type-task)");
  expect(projectColor({ color: null })).toBe("var(--primary)");
  expect(projectColor({ color: "broken", domain: { key: "unknown" } }, "unknown")).toBe("var(--primary)");
  expect(projectColor({ domain: { key: "constructor" } }, "constructor")).toBe("var(--primary)");
});

it("uses semantic domain defaults instead of historical stored seed colors", () => {
  expect(domainColor({ key: "health", color: "#f43f5e" })).toBe("var(--domain-health)");
  expect(domainColor({ key: "custom", color: "#abcdef" })).toBe("#abcdef");
  expect(itemColor("unknown")).toBe("var(--muted-foreground)");
});

it.each(["#fff", "#abcd", "#AABBcc", "#12345678"])("accepts a portable explicit override %s", (value) => expect(isProjectColor(value)).toBe(true));
it.each(["", "red", "var(--primary)", "#12345", "#123456; color:red", {}, 42])("rejects invalid stored override %j", (value) => expect(isProjectColor(value)).toBe(false));
it.each(["var(--type-task)", "hsl(220 70% 45%)", "oklch(0.6 0.2 240)", "#abcdef"])("tints and gradients support %s without hex suffixes", (value) => {
  expect(colorWithAlpha(value, 12)).toBe(`color-mix(in oklab, ${value} 12%, transparent)`);
  expect(colorGradient(value, 12, "60%")).toBe(`linear-gradient(135deg, color-mix(in oklab, ${value} 12%, transparent), transparent 60%)`);
});
