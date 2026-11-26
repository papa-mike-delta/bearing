"use client";
import { useEffect } from "react";

/** Marks the document so V1 can reuse landing colors without restyling legacy. */
export function V1Scope() {
  useEffect(() => {
    document.documentElement.classList.add("bearing-v1");
    return () => document.documentElement.classList.remove("bearing-v1");
  }, []);
  return null;
}
