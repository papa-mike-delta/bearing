/** Internal browser adapter for the explicit-save module. No browser globals:
 * the hook supplies the real browser and tests supply controlled history.
 */
export type NavigationBrowser = {
  window: Pick<Window, "addEventListener" | "removeEventListener" | "confirm">;
  document: Pick<Document, "addEventListener" | "removeEventListener">;
  history: Pick<History, "pushState" | "back" | "state">;
  location: Pick<Location, "href">;
  isElement: (target: EventTarget | null) => target is Element;
};

export function createExplicitSaveNavigation() {
  let active = false;
  return {
    sync(dirty: boolean) { active = dirty; },
    leaveWithoutPrompt() { active = false; },
    listen(browser: NavigationBrowser, subject: string) {
      const { window, document, isElement } = browser;
      const message = `Discard your unsaved ${subject} changes?`;
      const unload = (event: BeforeUnloadEvent) => {
        if (!active) return;
        event.preventDefault();
        event.returnValue = "";
      };
      const click = (event: MouseEvent) => {
        const link = isElement(event.target) ? event.target.closest("a[href]") : null;
        if (!active || !link || event.ctrlKey || event.metaKey || link.getAttribute("target") === "_blank") return;
        if (!window.confirm(message)) { event.preventDefault(); event.stopPropagation(); }
        else active = false;
      };
      const submit = (event: SubmitEvent) => {
        if (!active || (isElement(event.target) && (event.target.hasAttribute("data-explicit-save-editor") || event.target.hasAttribute("data-note-editor") || event.target.hasAttribute("data-journal-editor")))) return;
        if (!window.confirm(message)) { event.preventDefault(); event.stopPropagation(); }
        else active = false;
      };
      window.addEventListener("beforeunload", unload);
      document.addEventListener("click", click, true);
      document.addEventListener("submit", submit, true);
      return () => {
        window.removeEventListener("beforeunload", unload);
        document.removeEventListener("click", click, true);
        document.removeEventListener("submit", submit, true);
      };
    },
    guardHistory({ window, history, location }: NavigationBrowser, subject: string) {
      // A same-URL entry keeps Next's popstate handler on this editor while the user decides.
      history.pushState({ ...history.state, noteGuard: true }, "", location.href);
      let guarded = true;
      const back = () => {
        guarded = false;
        if (!active || window.confirm(`Discard your unsaved ${subject} changes?`)) {
          active = false;
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
    },
  };
}
