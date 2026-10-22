"use client";
import { useCallback, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useBrowserToday } from "../browser-today";
import { duePeople } from "./actions";
const serverCount = () => null;
export function PeopleCount() {
  const today = useBrowserToday();
  const pathname = usePathname();
  // Per mounted header, so a different signed-in account cannot inherit counts.
  const [store] = useState(() => ({ today: "", count: null as number | null }));
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!today) return () => {};
      let live = true;
      const load = () => {
        duePeople(today)
          .then((result) => {
            if (live && "count" in result) {
              store.today = today;
              store.count = result.count;
              onChange();
            }
          })
          .catch(() => {});
      };
      load();
      window.addEventListener("people-changed", load);
      window.addEventListener("focus", load);
      return () => {
        live = false;
        window.removeEventListener("people-changed", load);
        window.removeEventListener("focus", load);
      };
    },
    [today, pathname, store],
  );
  const snapshot = useCallback(
    () => (store.today === today ? store.count : null),
    [today, store],
  );
  const count = useSyncExternalStore(subscribe, snapshot, serverCount);
  return count === null ? null : (
    <span className="habit-count">
      {count}
      <span className="sr-only"> people due</span>
    </span>
  );
}
