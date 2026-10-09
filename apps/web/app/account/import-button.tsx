"use client";

import { Button } from "@repo/ui/components/button";
import { useFormStatus } from "react-dom";

export function ImportThemeButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Importing…" : "Import"}
    </Button>
  );
}
