"use client";

import { useFormStatus } from "react-dom";

// Disabled while the change runs, since hashing the new password is slow.
export function ChangePasswordButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "Changing password…" : "Change password"}
    </button>
  );
}
