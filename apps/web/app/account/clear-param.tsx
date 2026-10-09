"use client";

import { useEffect } from "react";

// The flags only mean "show the notice this once". Drop them after mount so
// a reload does not show it again. replaceState leaves the notice up; a
// navigation would re-render and clear it.
export function ClearParam() {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("imported");
    url.searchParams.delete("changed");
    window.history.replaceState(null, "", url);
  }, []);
  return null;
}
