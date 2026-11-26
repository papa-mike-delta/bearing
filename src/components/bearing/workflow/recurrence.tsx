"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SectionCard } from "../layout";
import { fieldClass, request, useWorkspace } from "./context";
import type { ItemRecord } from "@/lib/v1/client-model";
import type { RecurrenceRule } from "@/lib/v1/dates";
type Series = {
  id: string;
  rule: RecurrenceRule;
  occurrences: {
    itemId: string;
    scheduledAt: string;
    completedAt: string | null;
  }[];
};
export function TaskRecurrence({
  item,
  unsaved,
}: {
  item: ItemRecord;
  unsaved: boolean;
}) {
  const { userId, mutate } = useWorkspace();
  const client = useQueryClient();
  const key = ["v1-recurrences", userId];
  const query = useQuery({
    queryKey: [...key, item.id, item.revision],
    queryFn: () => request<Series[]>(userId, "recurrences"),
  });
  const [mode, setMode] = useState<"calendar" | "completion">("calendar");
  const [unit, setUnit] = useState<"day" | "week" | "month">("day");
  const [interval, setInterval] = useState(1);
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const series = query.data?.find((row) =>
    row.occurrences.some((o) => o.itemId === item.id),
  );
  return (
    <SectionCard title="Task recurrence">
      <p className="mb-3 text-sm text-muted-foreground">
        Fixed schedules follow the local calendar; completion intervals count
        from when you finish. Completed instances and their dates stay in
        history. Save a scheduled start before enabling recurrence.
      </p>
      {query.isPending ? (
        <p role="status">Loading recurrence…</p>
      ) : query.isError ? (
        <p role="alert">
          Could not load recurrence.{" "}
          <button
            className="min-h-11 underline"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </p>
      ) : series ? (
        <div className="space-y-3">
          <p role="status">
            Repeats every {series.rule.interval} {series.rule.unit}(s),{" "}
            {series.rule.mode === "calendar"
              ? `on the calendar at ${series.rule.localTime}`
              : "after completion"}{" "}
            · {series.rule.timezone}.
          </p>
          <ul className="space-y-2 text-sm">
            {series.occurrences.map((o) => (
              <li key={o.itemId}>
                <Link
                  className="inline-flex min-h-11 items-center underline"
                  href={`/app/library/${o.itemId}`}
                >
                  {o.completedAt ? "Completed instance" : "Scheduled instance"}{" "}
                  ·{" "}
                  {new Date(o.scheduledAt).toLocaleString(undefined, {
                    timeZone: series.rule.timezone,
                  })}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || unsaved) return;
            setBusy(true);
            setError("");
            try {
              await mutate(`items/${item.id}/recurrence`, {
                revision: item.revision,
                data: {
                  mode,
                  unit,
                  interval,
                  timezone: item.timezone,
                  ...(mode === "calendar" ? { localTime: time } : {}),
                },
              });
              await client.invalidateQueries({ queryKey: key });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm">
            Repeat from
            <select
              className={`${fieldClass} mt-1`}
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="calendar">Fixed calendar schedule</option>
              <option value="completion">Completion time</option>
            </select>
          </label>
          <label className="block text-sm">
            Repeat interval
            <input
              type="number"
              min={1}
              max={365}
              required
              className={`${fieldClass} mt-1`}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            Repeat unit
            <select
              className={`${fieldClass} mt-1`}
              value={unit}
              onChange={(e) => setUnit(e.target.value as typeof unit)}
            >
              <option value="day">Days</option>
              <option value="week">Weeks</option>
              <option value="month">Months</option>
            </select>
          </label>
          {mode === "calendar" && (
            <label className="block text-sm">
              Repeat local time
              <input
                type="time"
                required
                className={`${fieldClass} mt-1`}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          )}
          <p className="text-sm text-muted-foreground">
            Timezone: {item.timezone}.{" "}
            {unsaved
              ? "Save your pending edits first."
              : !item.scheduledAt
                ? "Set and save a scheduled start above first."
                : "The next instance is created only when this Task is completed."}
          </p>
          <Button
            disabled={
              busy ||
              unsaved ||
              !item.scheduledAt ||
              item.status === "done" ||
              item.status === "archived"
            }
          >
            {busy ? "Enabling…" : "Enable recurrence"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-destructive">
          {error}
        </p>
      )}
    </SectionCard>
  );
}
