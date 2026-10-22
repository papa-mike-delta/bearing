"use client";

import { useState } from "react";
import type { NextDateRule } from "@repo/domain";
import { saveTaskRule } from "../app/actions";
import { NextDateRuleControl } from "./next-date-rule-control";

export function TaskRule({
  id,
  initial,
}: {
  id: string;
  initial: NextDateRule | null;
}) {
  const [rule, setRule] = useState(initial);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="rule-control space-y-2"
      action={async (form) => {
        setPending(true);
        setError("");
        try {
          await saveTaskRule(form);
        } catch {
          setError("Could not save the rule. Please retry.");
        } finally {
          setPending(false);
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="rule" value={JSON.stringify(rule)} />
      <NextDateRuleControl value={rule} onChange={setRule} />
      <button type="submit" className="rule-save" disabled={pending}>
        Save rule
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
