"use client";
import { createContext, useContext } from "react";
import { outbox } from "@/lib/v1/outbox";
import { BrowserWriteError } from "@/lib/browser-writes";
import type { Workspace } from "@/lib/v1/client-model";
import type { LinkProposal } from "@/lib/v1/link-proposals";
export async function request<T = any>(
  userId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Bearing-Account": userId,
        ...init.headers,
      },
    });
  } catch {
    throw new Error("Connection unavailable. Your draft is retained.");
  }
  const body = await response.json();
  if (!response.ok) {
    if (
      response.status === 401 ||
      (response.status === 409 && body.error?.startsWith("Account changed"))
    )
      await outbox.lockAccount();
    if (response.status === 409 && "currentRevision" in body)
      throw new BrowserWriteError({
        kind: "conflict",
        currentRevision: body.currentRevision,
        source: "user",
        status: 409,
        receiptId: body.receiptId,
        message:
          "This record changed. Your edits are retained; discard changes to load the latest version.",
      });
    throw new BrowserWriteError({
      kind: "error",
      source: "user",
      status: response.status,
      receiptId: body.receiptId,
      error: body.error || "Request failed",
      message: body.issues?.[0]?.message
        ? `${body.error}: ${body.issues[0].message}`
        : body.error || "Request failed",
    });
  }
  return body;
}
export const WorkspaceContext = createContext<{
  userId: string;
  data: Workspace;
  proposals: readonly LinkProposal[];
  timezone: string;
  refresh(): Promise<void>;
  mutate<T = any>(path: string, body: unknown, method?: string): Promise<T>;
} | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Signed-in workspace required");
  return value;
}
export const fieldClass =
  "min-h-11 w-full rounded-xl border border-border/80 bg-background/70 px-3 py-2 text-sm text-foreground";
