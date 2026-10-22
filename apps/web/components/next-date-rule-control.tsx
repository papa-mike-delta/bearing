"use client";

import {
  maxNextDateEvery,
  nextDatePhrase,
  nextDateUnits,
  weekdays,
  type NextDateRule,
} from "@repo/domain";
import { ruleControlChange } from "../lib/next-date-control.ts";

// The one control for editing a next-date rule: Tasks (Repeat) and People
// (Reach-out rule) both use it, so the rule reads the same everywhere.
export function NextDateRuleControl({
  value,
  onChange,
  toggleLabel = "Repeat",
  sameDayLabel = "No on-day",
}: {
  value: NextDateRule | null;
  onChange: (rule: NextDateRule | null) => void;
  toggleLabel?: string;
  sameDayLabel?: string;
}) {
  const change = (field: Parameters<typeof ruleControlChange>[1], text = "") =>
    onChange(ruleControlChange(value, field, text));
  const toggle = (
    <label className="check-row">
      <input
        type="checkbox"
        checked={value !== null}
        onChange={(event) => change(event.target.checked ? "enable" : "clear")}
      />{" "}
      {toggleLabel}
    </label>
  );
  if (!value) return <div className="rule-control">{toggle}</div>;
  return (
    <fieldset className="rule-control space-y-2">
      <legend className="sr-only">{toggleLabel}</legend>
      {toggle}
      <div className="rule-row">
        <label className="field">
          Every
          <input
            aria-label="Every"
            name="every"
           
            type="number"
            min={1}
            max={maxNextDateEvery}
            value={value.every}
            onChange={(event) => change("every", event.target.value)}
          />
        </label>
        <label className="field">
          Unit
          <select
            aria-label="Unit"
            name="unit"
           
            value={value.unit}
            onChange={(event) => change("unit", event.target.value)}
          >
            {nextDateUnits.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
        {value.unit !== "days" ? (
          <label className="field">
            On day (optional)
            <select
              aria-label="On day (optional)"
              name="on"
             
              value={value.on ?? ""}
              onChange={(event) => change("on", event.target.value)}
            >
              <option value="">{sameDayLabel}</option>
              {value.unit === "weeks" ? (
                weekdays.map((day) => (
                  <option key={day} value={day}>
                    {day[0]!.toUpperCase() + day.slice(1)}
                  </option>
                ))
              ) : (
                <>
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                  <option value="last">Last day</option>
                </>
              )}
            </select>
          </label>
        ) : null}
      </div>
      <p aria-live="polite">{nextDatePhrase(value)}</p>
    </fieldset>
  );
}
