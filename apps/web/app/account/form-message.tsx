"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

// The note is about the last attempt. Hide it when a field changes or the
// form is submitted, then show the next result (even the same error again).
export function FormMessage({
  role,
  message,
}: {
  role: "alert" | "status";
  message: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { pending } = useFormStatus();
  const [dismissed, setDismissed] = useState(false);
  const [wasPending, setWasPending] = useState(pending);
  const [shown, setShown] = useState(message);

  if (message !== shown) {
    setShown(message);
    setDismissed(false);
  }
  if (pending !== wasPending) {
    setWasPending(pending);
    if (!pending) setDismissed(false);
  }

  const visible = !dismissed && !pending;

  // Re-bind when the paragraph mounts again. A submit unmounts it, and the
  // next result mounts a new one.
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const hide = () => setDismissed(true);
    form.addEventListener("input", hide);
    form.addEventListener("submit", hide);
    return () => {
      form.removeEventListener("input", hide);
      form.removeEventListener("submit", hide);
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <p
      ref={ref}
      role={role}
      className={role === "alert" ? "text-destructive" : undefined}
    >
      {message}
    </p>
  );
}
