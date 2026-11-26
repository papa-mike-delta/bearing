"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FocusTimer, type FocusCompletion } from "../views/focus-view";
import { GraphExplorer } from "../views/graph-view";
import { useWorkspace } from "./context";
import { graphData } from "@/lib/v1/connected";
import { dateInZone } from "@/lib/v1/dates";
import { Button } from "@/components/ui/button";
import { RelationshipPrompts } from "./relationship-prompts";
export function ConnectedGraph() {
  const { data } = useWorkspace(),
    router = useRouter(),
    graph = useMemo(() => graphData(data), [data]);
  return (
    <div className="space-y-4">
      <GraphExplorer
        data={graph}
        openItemDetail={(id) => router.push(`/app/library/${id}`)}
        openProject={(id) => router.push(`/app/projects/${id}`)}
      />
      <RelationshipPrompts scope={{ itemIds: data.items.map((item) => item.id), projectIds: data.projects.map((project) => project.id) }} />
    </div>
  );
}
type PendingFocus = FocusCompletion & { timezone: string };
export function ConnectedFocus() {
  const { userId, data, timezone, mutate } = useWorkspace(),
    router = useRouter();
  const key = `bearing-focus-pending:${userId}`;
  const mutateRef = useRef(mutate);
  const [pending, setPending] = useState<PendingFocus[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const inFlight = useRef(false),
    current = useRef(pending);
  useEffect(() => {
    mutateRef.current = mutate;
    current.current = pending;
  }, [mutate, pending]);
  function retain(list: PendingFocus[]) {
    localStorage.setItem(key, JSON.stringify(list));
    current.current = list;
    setPending(list);
  }
  const sync = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      // Read storage again so a completed session in a second tab is not silently discarded.
      const queue: PendingFocus[] = JSON.parse(
        localStorage.getItem(key) || "[]",
      );
      for (const session of queue) {
        await mutateRef.current("activities", {
          kind: "focus",
          clientId: session.clientId,
          occurredAt: session.occurredAt,
          timezone: session.timezone,
          itemId: session.itemId,
          data: { minutes: session.minutes },
        });
        const remaining = (
          JSON.parse(localStorage.getItem(key) || "[]") as PendingFocus[]
        ).filter((s) => s.clientId !== session.clientId);
        localStorage.setItem(key, JSON.stringify(remaining));
        current.current = remaining;
        setPending(remaining);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save focus session; retry below.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [key]);
  useEffect(() => {
    const initial = setTimeout(() => {
      try {
        setPending(JSON.parse(localStorage.getItem(key) || "[]"));
      } catch {
        setError("Could not read pending focus sessions.");
      }
      void sync();
    }, 0);
    const online = () => void sync();
    window.addEventListener("online", online);
    return () => {
      clearTimeout(initial);
      window.removeEventListener("online", online);
    };
  }, [key, sync]);
  const today = dateInZone(new Date(), timezone),
    sessions = data.activities.filter(
      (a) => a.kind === "focus" && a.localDate === today,
    );
  const active = data.items.filter(
    (i) => !["done", "archived"].includes(i.status),
  );
  return (
    <div className="space-y-4">
      <FocusTimer
        tasks={active.filter((i) => i.type === "task")}
        habits={active.filter((i) => i.type === "habit")}
        stats={{
          sessions: sessions.length,
          minutes: sessions.reduce((sum, a) => sum + a.data.minutes, 0),
        }}
        onNewTask={() =>
          router.push(`/app/library/new?type=task&draft=${crypto.randomUUID()}`)
        }
        onComplete={(session) => {
          try {
            const existing: PendingFocus[] = JSON.parse(
              localStorage.getItem(key) || "[]",
            );
            retain([
              ...existing.filter((s) => s.clientId !== session.clientId),
              { ...session, timezone },
            ]);
            void sync();
          } catch {
            setPending([...current.current, { ...session, timezone }]);
            setError(
              "Device storage unavailable. Keep this page open and retry saving.",
            );
          }
        }}
      />
      {!!pending.length && (
        <p role="status">
          {pending.length} completed session(s) waiting to save.{" "}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              try {
                retain(current.current);
                void sync();
              } catch {
                setError("Device storage is still unavailable.");
              }
            }}
          >
            Retry saving Focus
          </Button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Pause before leaving this view. Completed sessions persist to your
        account; an unfinished timer is not recorded as completed.
      </p>
    </div>
  );
}
