"use client";

import { useSyncExternalStore } from "react";
import { localToday } from "../lib/today";

function subscribe(listener: () => void) {
  let timer: ReturnType<typeof setTimeout>;
  const refresh = () => {
    listener();
    clearTimeout(timer);
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    timer = setTimeout(refresh, midnight.getTime() - now.getTime());
  };
  refresh();
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", refresh);
  };
}

export function useBrowserToday() {
  return useSyncExternalStore(
    subscribe,
    () => localToday(),
    () => null,
  );
}

// Stamped on submit from the browser. Empty until the client knows the day.
export function BrowserToday() {
  const today = useBrowserToday();
  return <input type="hidden" name="today" value={today ?? ""} />;
}
