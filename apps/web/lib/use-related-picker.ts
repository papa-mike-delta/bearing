import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { LinkEnd } from "@repo/domain";
import { findLinkTargets } from "../app/related-actions";
import { createRelatedPicker, showNoMatches } from "./related-picker";
import { localToday } from "./today";

export function useRelatedPicker(source: LinkEnd) {
  const [picker] = useState(() =>
    createRelatedPicker({
      source,
      search: findLinkTargets,
      today: localToday,
    }),
  );
  useLayoutEffect(() => {
    picker.dispatch({
      type: "source",
      source: { kind: source.kind, id: source.id },
    });
  }, [picker, source.kind, source.id]);
  useEffect(() => () => picker.dispatch({ type: "cancel" }), [picker]);
  const state = useSyncExternalStore(
    picker.subscribe,
    picker.getSnapshot,
    picker.getSnapshot,
  );
  return {
    ...state,
    noMatches: showNoMatches(state),
    dispatch: picker.dispatch,
  };
}
