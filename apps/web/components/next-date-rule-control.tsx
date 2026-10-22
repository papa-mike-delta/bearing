"use client";

import {
  maxNextDateEvery,
  nextDatePhrase,
  nextDateUnits,
  weekdays,
  type NextDateRule,
} from "@repo/domain";
import { ruleControlChange } from "../lib/next-date-control.ts";

// Shared by any screen that edits the one next-date rule.
export function NextDateRuleControl({
  value,
  onChange,
}: {
  value: NextDateRule | null;
  onChange: (rule: NextDateRule | null) => void;
}) {
  const change = (field: Parameters<typeof ruleControlChange>[1], text = "") =>
    onChange(ruleControlChange(value, field, text));
  if (!value)
    return (
      <button type="button" onClick={() => change("enable")}>
        Repeat
      </button>
    );
  return (
    <fieldset>
      <legend>Repeat</legend>
      <label>
        Every{" "}
        <input
          aria-label="Repeat interval"
          type="number"
          min={1}
          max={maxNextDateEvery}
          value={value.every}
          onChange={(event) => change("every", event.target.value)}
        />
      </label>
      <label>
        Unit{" "}
        <select
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
        <label>
          On{" "}
          <select
            value={value.on ?? ""}
            onChange={(event) => change("on", event.target.value)}
          >
            <option value="">No on-day</option>
            {value.unit === "weeks" ? (
              weekdays.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))
            ) : (
              <>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
                <option value="last">last day</option>
              </>
            )}
          </select>
        </label>
      ) : null}
      <p>{nextDatePhrase(value)}</p>
      <button type="button" onClick={() => change("clear")}>
        Clear rule
      </button>
    </fieldset>
  );
}
