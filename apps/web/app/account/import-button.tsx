"use client";

import { useFormStatus } from "react-dom";

export function ImportThemeButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Importing…" : "Import"}
    </button>
  );
}
