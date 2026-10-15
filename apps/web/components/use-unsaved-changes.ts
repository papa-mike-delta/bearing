"use client";

import { useEffect, useState } from "react";
import { createExplicitSaveNavigation, type NavigationBrowser } from "../lib/explicit-save-navigation";

function browser(): NavigationBrowser {
  return { window, document, history, location, isElement: (target): target is Element => target instanceof Element };
}

/** Internal browser lifecycle for useExplicitSave. Re-arm on each render just
 * as the original guard did; an intentional leave only suppresses this exit.
 */
export function useUnsavedChanges(dirty: boolean, subject = "Note") {
  const [navigation] = useState(createExplicitSaveNavigation);
  navigation.sync(dirty);
  useEffect(() => {
    return navigation.listen(browser(), subject);
  }, [navigation, subject]);

  useEffect(() => {
    if (!dirty) return;
    return navigation.guardHistory(browser(), subject);
  }, [navigation, dirty, subject]);
  return navigation.leaveWithoutPrompt;
}
