"use client";

import { useSyncExternalStore } from "react";
import { localToday } from "../lib/today";

function useBrowserToday() {
  return useSyncExternalStore(
    () => () => {},
    () => localToday(),
    () => null,
  );
}

// Stamped on submit from the browser. Empty until the client knows the day.
export function BrowserToday() {
  const today = useBrowserToday();
  return <input type="hidden" name="today" value={today ?? ""} />;
}
