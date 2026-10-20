"use client";

import { useEffect, useId, useRef, useState } from "react";
import { finishHabitCountEdit, type HabitCountEdit } from "../../lib/habit-count-state";

export function HabitCount({ count, cap, label, disabled, className, children, onSave }: {
  count: number; cap: number; label: string; disabled: boolean; className: string;
  children: React.ReactNode; onSave: (count: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const state = useRef<HabitCountEdit>({ text: "", stored: count, active: false });
  const restore = useRef(false);
  const errorId = useId();
  useEffect(() => {
    if (editing) { input.current?.focus(); input.current?.select(); }
    else if (restore.current && !saving && !disabled) { button.current?.focus(); restore.current = false; }
  }, [editing, saving, disabled]);

  async function finish(event: "Enter" | "blur" | "Escape") {
    if (!state.current.active) return;
    const result = finishHabitCountEdit(state.current, event, cap);
    state.current = result.state;
    restore.current = true;
    setError(result.error ?? "");
    setEditing(false);
    if (result.save !== undefined) {
      setSaving(true);
      try { await onSave(result.save); }
      finally { setSaving(false); }
    }
  }

  return <span className={`habit-count-editor${editing ? " is-editing" : ""}`} onClick={() => { if (editing) input.current?.focus(); }}>
    {editing ? <input ref={input} className="habit-count-input" type="number" inputMode="numeric" step="1" min="0" max={cap}
      aria-label={label} value={text} onChange={(event) => { setText(event.target.value); state.current.text = event.target.value; }}
      onBlur={() => void finish("blur")} onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); void finish(event.key); }
      }} /> : <button ref={button} type="button" className={`habit-count-button ${className}`} disabled={disabled || saving}
      aria-label={label} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
      onClick={() => { state.current = { text: String(count), stored: count, active: true }; setText(String(count)); setError(""); setEditing(true); }}>
      {children}
    </button>}
    {error && <span id={errorId} className="field-error habit-count-error" role="alert">{error}</span>}
  </span>;
}
