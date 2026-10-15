"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useUnsavedChanges } from "../components/use-unsaved-changes";
import { createExplicitSave, type ExplicitSaveAdapter, type ExplicitSaveOptions } from "./explicit-save";

export function useExplicitSave<Value, Saved>(options: ExplicitSaveOptions<Value, Saved> & {
  save: ExplicitSaveAdapter<Value, Saved>;
  subject?: string;
}) {
  const [session] = useState(() => createExplicitSave(options));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [pending, start] = useTransition();
  const leaveWithoutPrompt = useUnsavedChanges(state.dirty, options.subject);
  return {
    ...state,
    pending: pending || state.pending,
    edit: session.edit,
    loadBaseline: session.loadBaseline,
    setError: session.setError,
    save: () => start(() => session.save(options.save)),
    leaveWithoutPrompt,
  };
}
