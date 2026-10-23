import {
  defaultNextDateRule,
  parseNextDateRule,
  type NextDateRule,
} from "@repo/domain";

export function ruleControlChange(
  rule: NextDateRule | null,
  field: "enable" | "clear" | "every" | "unit" | "on",
  value: string,
): NextDateRule | null {
  if (field === "clear") return null;
  if (field === "enable") return { ...defaultNextDateRule };
  if (!rule) return null;
  const candidate =
    field === "unit"
      ? { every: rule.every, unit: value }
      : field === "every"
        ? { ...rule, every: Number(value) }
        : value === ""
          ? { every: rule.every, unit: rule.unit }
          : {
              ...rule,
              on:
                rule.unit === "months" && value !== "last"
                  ? Number(value)
                  : value,
            };
  return parseNextDateRule(candidate) ?? rule;
}
