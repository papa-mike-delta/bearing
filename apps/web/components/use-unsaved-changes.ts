"use client";

import { useEffect, useRef } from "react";

export function useUnsavedChanges(dirty: boolean, subject = "Note") {
  const active = useRef(dirty);
  active.current = dirty;
  useEffect(() => {
    const message = `Discard your unsaved ${subject} changes?`;
    const unload = (event: BeforeUnloadEvent) => {
      if (!active.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!active.current || !link || event.ctrlKey || event.metaKey || link.getAttribute("target") === "_blank") return;
      if (!window.confirm(message)) { event.preventDefault(); event.stopPropagation(); }
      else active.current = false;
    };
    const submit = (event: SubmitEvent) => {
      if (!active.current || (event.target instanceof Element && (event.target.hasAttribute("data-note-editor") || event.target.hasAttribute("data-journal-editor")))) return;
      if (!window.confirm(message)) { event.preventDefault(); event.stopPropagation(); }
      else active.current = false;
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
    };
  }, [subject]);

  useEffect(() => {
    if (!dirty) return;
    // A same-URL entry keeps Next's popstate handler on this editor while the user decides.
    history.pushState({ ...history.state, noteGuard: true }, "", location.href);
    let guarded = true;
    const back = () => {
      guarded = false;
      if (!active.current || window.confirm(`Discard your unsaved ${subject} changes?`)) {
        active.current = false;
        window.removeEventListener("popstate", back);
        history.back();
      } else {
        history.pushState({ ...history.state, noteGuard: true }, "", location.href);
        guarded = true;
      }
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      if (guarded && history.state?.noteGuard) history.back();
    };
  }, [dirty, subject]);
  return active;
}
