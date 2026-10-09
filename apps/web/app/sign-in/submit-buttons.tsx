"use client";

import { Button } from "@repo/ui/components/button";
import { useState } from "react";
import { useFormStatus } from "react-dom";

type Action = (formData: FormData) => Promise<void>;

// Both buttons are disabled while the form submits, and the one pressed says
// what's happening. Creating an account hashes the password, which is slow.
export function SubmitButtons({
  signIn,
  createAccount,
}: {
  signIn: Action;
  createAccount: Action;
}) {
  const { pending } = useFormStatus();
  const [pressed, setPressed] = useState<"sign-in" | "create">();
  return (
    <>
      <Button
        type="submit"
        formAction={signIn}
        disabled={pending}
        onClick={() => setPressed("sign-in")}
      >
        {pending && pressed === "sign-in" ? "Signing in…" : "Sign in"}
      </Button>
      <Button
        type="submit"
        variant="outline"
        formAction={createAccount}
        disabled={pending}
        onClick={() => setPressed("create")}
      >
        {pending && pressed === "create"
          ? "Creating account…"
          : "Create account"}
      </Button>
    </>
  );
}
