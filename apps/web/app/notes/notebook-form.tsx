"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import { addNotebook } from "./actions";

export function NotebookForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return <form className="panel" onSubmit={(event) => {
    event.preventDefault();
    start(async () => {
      try {
        const result = await addNotebook(name);
        if ("error" in result) setError(result.error);
        else router.push(result.href);
      } catch { setError("Could not create notebook. Please try again."); }
    });
  }}>
    <FieldGroup><Field><FieldLabel htmlFor="notebook-name">New notebook</FieldLabel>
      <Input id="notebook-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required disabled={pending} />
    </Field></FieldGroup>
    {error && <p role="alert">{error}</p>}
    <Button type="submit" disabled={pending} className="self-end">{pending ? "Creating…" : "Create notebook"}</Button>
  </form>;
}
