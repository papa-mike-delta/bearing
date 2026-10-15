export type ExplicitSaveState<Value, Saved> = {
  readonly value: Value;
  readonly saved: Saved;
  readonly baseline: Value;
  readonly dirty: boolean;
  readonly pending: boolean;
  readonly error: string;
};

export type ExplicitSaveAdapter<Value, Saved> = (
  session: Pick<ExplicitSaveState<Value, Saved>, "value" | "saved" | "baseline">,
) => Promise<{ value: Value; saved: Saved } | { error: string }>;

export type ExplicitSaveOptions<Value, Saved> = {
  initial: { value: Value; saved: Saved };
  equal?: (left: Value, right: Value) => boolean;
  failureMessage: string;
};

/** One opening of a document. Refreshed props must not replace local work.
 * Values are immutable; only an accepted save advances the persisted baseline.
 * A virtual baseline can change the editor without creating a saved document.
 */
export function createExplicitSave<Value, Saved>({
  initial,
  equal = Object.is,
  failureMessage,
}: ExplicitSaveOptions<Value, Saved>) {
  let state: ExplicitSaveState<Value, Saved> = {
    ...initial,
    baseline: initial.value,
    dirty: false,
    pending: false,
    error: "",
  };
  const listeners = new Set<() => void>();

  function publish(change: Partial<ExplicitSaveState<Value, Saved>>) {
    const next = { ...state, ...change };
    state = { ...next, dirty: !equal(next.value, next.baseline) };
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    edit(value: Value) { publish({ value }); },
    loadBaseline(value: Value) {
      publish({ value, baseline: value, error: "" });
    },
    setError(error: string) { publish({ error }); },
    async save(adapter: ExplicitSaveAdapter<Value, Saved>) {
      if (state.pending) return;
      const submitted = state;
      publish({ pending: true, error: "" });
      try {
        const result = await adapter(submitted);
        if ("error" in result) publish({ error: result.error });
        else publish({
          saved: result.saved,
          baseline: result.value,
          // Editors disable input while saving. Also retain any newer edit if
          // an adapter is used without that UI constraint.
          value: equal(state.value, submitted.value) ? result.value : state.value,
        });
      } catch {
        publish({ error: failureMessage });
      } finally {
        publish({ pending: false });
      }
    },
  };
}
