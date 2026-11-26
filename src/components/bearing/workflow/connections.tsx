"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "../layout";
import { useWorkspace, fieldClass } from "./context";
import { validLinkEndpoints } from "@/lib/v1/link-policy";
import {
  navigationUrl,
  personContext,
  habitPeriod,
  upcomingDates,
} from "@/lib/v1/connected";
import { markdownTasks } from "@/lib/v1/workflow-dates";
import type { ItemRecord } from "@/lib/v1/client-model";
import { dateInZone } from "@/lib/v1/dates";
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Could not save";
export function Connections({ item }: { item: ItemRecord }) {
  const { data, mutate } = useWorkspace();
  const [toId, setTo] = useState(""),
    [type, setType] = useState("related_to"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const links = data.links.filter(
    (l) => l.fromId === item.id || l.toId === item.id,
  );
  const targets = data.items.filter(
    (i) => i.id !== item.id && validLinkEndpoints(type, item, i),
  );
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setTo("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard title="Connections">
      <div className="space-y-3">
        {links.map((l) => {
          const other = data.items.find(
            (i) => i.id === (l.fromId === item.id ? l.toId : l.fromId),
          );
          return (
            <div
              key={l.id}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <span>
                {l.fromId === item.id ? "→" : "←"} {l.type.replaceAll("_", " ")}
              </span>
              <Link
                className="min-w-0 break-words underline"
                href={`/app/library/${other?.id}`}
              >
                {other?.title}
              </Link>
              <Button
                variant="ghost"
                aria-label={`Remove connection to ${other?.title}`}
                disabled={busy}
                onClick={() =>
                  void action(() => mutate(`links/${l.id}`, {}, "DELETE"))
                }
              >
                Remove connection
              </Button>
            </div>
          );
        })}
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void action(() => mutate("links", { fromId: item.id, toId, type }));
          }}
        >
          <label className="block text-sm">
            Relationship
            <select
              className={fieldClass}
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setTo("");
              }}
            >
              {[
                "related_to",
                "mentions",
                "advances",
                "tracks",
                "scheduled_at",
                "located_at",
              ].map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Connect to
            <select
              required
              className={fieldClass}
              value={toId}
              onChange={(e) => setTo(e.target.value)}
            >
              <option value="">Choose an Item</option>
              {targets.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title} · {i.type}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" disabled={busy || !toId}>
            Add connection
          </Button>
        </form>
        {error && <p role="alert">{error}</p>}
        {item.type === "goal" && (
          <p className="text-xs text-muted-foreground">
            Connect work to this outcome using “advances”, or use “tracks” to
            connect this Goal to a Habit. Work keeps its own status.
          </p>
        )}
      </div>
    </SectionCard>
  );
}
export function BookmarkReference({ item }: { item: ItemRecord }) {
  const m = item.metadata as Record<string, any>;
  const navigate = m.category === "place" ? navigationUrl(m) : null;
  return (
    <SectionCard title="Saved reference">
      <div className="space-y-2 break-words text-sm">
        <p>
          {m.category}
          {m.format ? ` · ${m.format}` : ""}
          {m.creator ? ` · ${m.creator}` : ""}
        </p>
        {m.address && <p>{m.address}</p>}
        {m.latitude != null && (
          <p>
            {m.latitude}, {m.longitude}
          </p>
        )}
        {m.reference && <p>{m.reference}</p>}
        <div className="flex flex-wrap gap-4">
          {navigate && (
            <a
              className="inline-flex min-h-11 items-center underline"
              href={navigate}
              target="_blank"
              rel="noopener noreferrer"
            >
              Navigate in maps
            </a>
          )}
          {m.url && (
            <a
              className="inline-flex min-h-11 items-center underline"
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open external reference
            </a>
          )}
        </div>
        {m.category === "place" && !navigate && (
          <p>Add an address or coordinates to enable navigation.</p>
        )}
      </div>
    </SectionCard>
  );
}
export function PersonProfile({ item }: { item: ItemRecord }) {
  const { data, timezone, mutate } = useWorkspace(),
    context = personContext(data, item.id),
    m = item.metadata as Record<string, any>;
  const [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  // Retain the exact request after a failed/lost acknowledgment; a retry is the same interaction.
  const [pending, setPending] = useState<Record<string, any> | null>(null);
  const [momentId, setMoment] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    const input = pending || {
      clientId: crypto.randomUUID(),
      kind: "interaction",
      itemId: item.id,
      occurredAt: new Date().toISOString(),
      timezone,
      data: { note },
    };
    setPending(input);
    try {
      await mutate("activities", input);
      setPending(null);
      setNote("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const itemList = (items: ItemRecord[]) =>
    items.length ? (
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id}>
            <Link className="underline" href={`/app/library/${i.id}`}>
              {i.title}
            </Link>{" "}
            · {i.type}
            {i.followUpAt
              ? ` · follow up ${new Date(i.followUpAt).toLocaleDateString(undefined, { timeZone: timezone })}`
              : ""}
          </li>
        ))}
      </ul>
    ) : (
      <p>None yet.</p>
    );
  return (
    <div className="space-y-4">
      <SectionCard
        title={
          item.selfProfile
            ? "Me · your personal reference profile"
            : "Person profile"
        }
      >
        <div className="space-y-2 text-sm">
          {m.email && (
            <p>
              Email:{" "}
              <a className="underline" href={`mailto:${m.email}`}>
                {m.email}
              </a>
            </p>
          )}
          {m.phone && (
            <p>
              Phone:{" "}
              <a className="underline" href={`tel:${m.phone}`}>
                {m.phone}
              </a>
            </p>
          )}
          {m.relationship && <p>{m.relationship}</p>}
          {m.birthday && <p>Birthday: {m.birthday}</p>}
          {(m.importantDates || []).map((d: any, i: number) => (
            <p key={i}>
              {d.label}: {d.date}
            </p>
          ))}
          {item.selfProfile && (
            <p>
              Keep health and medication references in Notes linked here. Each
              Note remains a separate private record.
            </p>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Linked work and references">
        {itemList(context.linked)}
      </SectionCard>
      <SectionCard title="Planned follow-ups">
        {itemList(context.followUps)}
        <p className="mt-2 text-xs text-muted-foreground">
          Plans are not evidence that contact happened.
        </p>
      </SectionCard>
      <SectionCard title="Journal mentions">
        <div className="space-y-3 text-sm">
          {context.mentions.map((moment) => (
            <p key={moment.id}>
              <Link
                className="underline"
                href={`/app/journal?date=${moment.localDate}&moment=${moment.id}`}
              >
                {moment.localDate} · {moment.text.slice(0, 160)}
              </Link>
            </p>
          ))}
          {!context.mentions.length && <p>No mentions yet.</p>}
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await mutate(`journal/${momentId}/mention`, {
                  itemId: item.id,
                  revision: data.moments.find((m) => m.id === momentId)!
                    .revision,
                });
                setMoment("");
              } catch (err) {
                setError(errorText(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block">
              Link an existing Journal moment
              <select
                className={fieldClass}
                value={momentId}
                required
                onChange={(e) => setMoment(e.target.value)}
              >
                <option value="">Choose a moment</option>
                {data.moments
                  .filter((m) => !m.items.some((r) => r.itemId === item.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.localDate} · {m.text.slice(0, 100)}
                    </option>
                  ))}
              </select>
            </label>
            <Button disabled={busy || !momentId} variant="outline">
              Link mention
            </Button>
          </form>
        </div>
      </SectionCard>
      <SectionCard title="Confirmed interactions">
        <div className="space-y-3 text-sm">
          {context.interactions.map((a) => (
            <p key={a.id}>
              {new Date(a.occurredAt).toLocaleString(undefined, {
                timeZone: timezone,
              })}{" "}
              · {a.data.note || "Confirmed contact"}
            </p>
          ))}
          {!context.interactions.length && (
            <p>No confirmed interactions. A mention does not record contact.</p>
          )}
          <label className="block">
            Interaction note
            <textarea
              className={fieldClass}
              value={note}
              disabled={!!pending}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button disabled={busy} onClick={() => void confirm()}>
            {pending
              ? "Retry confirming interaction"
              : "Confirm interaction now"}
          </Button>
        </div>
      </SectionCard>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function RelationshipReminders({ date }: { date: string }) {
  const { data, timezone } = useWorkspace(),
    dates = upcomingDates(data.items, date);
  const follow = data.items.filter(
    (i) =>
      i.type === "task" &&
      !!i.followUpAt &&
      !["done", "archived"].includes(i.status) &&
      dateInZone(i.followUpAt!, timezone) <= date,
  );
  if (!dates.length && !follow.length) return null;
  return (
    <SectionCard title="Dates and follow-ups">
      <div className="space-y-2 text-sm">
        {dates.map((d, i) => (
          <p key={i}>
            <Link className="underline" href={`/app/library/${d.person.id}`}>
              {d.person.title}
            </Link>{" "}
            · {d.label} · {d.date}
          </p>
        ))}
        {follow.map((i) => (
          <p key={i.id}>
            <Link className="underline" href={`/app/library/${i.id}`}>
              {i.title}
            </Link>{" "}
            · follow-up due
          </p>
        ))}
      </div>
    </SectionCard>
  );
}
export function HabitOccurrence({
  item,
  date,
}: {
  item: ItemRecord;
  date: string;
}) {
  const { data, timezone, mutate } = useWorkspace();
  const router = useRouter();
  const period = habitPeriod(
    instantFromInput(`${date}T12:00`, item.timezone),
    item.timezone,
    (item.metadata as any).cadence || "daily",
  );
  // Wrapper key remounts only for a different canonical period or saved revision.
  const saved = data.habitOccurrences.find(
    (o) =>
      o.key ===
      `habit.${item.id}.${(item.metadata as any).cadence || "daily"}.${period}`,
  )?.value;
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Occurrence date
        <input
          type="date"
          className={fieldClass}
          value={date}
          onChange={(e) =>
            e.target.value &&
            router.push(`/app/library/${item.id}?date=${e.target.value}`)
          }
        />
      </label>
      <OccurrenceForm
        key={`${period}:${saved?.revision || 0}`}
        item={item}
        period={period}
        saved={saved}
        timezone={timezone}
        mutate={mutate}
        date={date}
      />
    </div>
  );
}
import type { HabitOccurrence as Occurrence } from "@/lib/v1/client-model";
import { instantFromInput } from "@/lib/v1/workflow-dates";
function OccurrenceForm({
  item,
  period,
  saved,
  timezone,
  mutate,
  date,
}: {
  item: ItemRecord;
  period: string;
  saved?: Occurrence;
  timezone: string;
  mutate: ReturnType<typeof useWorkspace>["mutate"];
  date: string;
}) {
  const content = saved?.content ?? item.content,
    tasks = markdownTasks(content);
  const [checks, setChecks] = useState(
      saved?.checklist || tasks.map(() => false),
    ),
    [value, setValue] = useState(
      saved?.value ?? (item.metadata as any).quantity ?? 1,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(complete: boolean) {
    setBusy(true);
    setError("");
    try {
      await mutate(
        `items/${item.id}/occurrence`,
        {
          revision: saved?.revision || 0,
          occurredAt:
            date === dateInZone(new Date(), item.timezone)
              ? new Date().toISOString()
              : instantFromInput(`${date}T12:00`, item.timezone),
          timezone: item.timezone,
          checklist: checks,
          value,
          complete,
        },
        "PUT",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard title={`Habit occurrence · ${period}`}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Period in {item.timezone}. Step checkmarks belong to this occurrence;
          they never mark the Habit complete automatically.
        </p>
        {tasks.map((t, i) => (
          <label
            className="flex min-h-11 items-center gap-2 text-sm"
            key={t.index}
          >
            <input
              type="checkbox"
              checked={checks[i] || false}
              disabled={busy || saved?.completed}
              onChange={(e) =>
                setChecks(
                  checks.map((v, n) => (n === i ? e.target.checked : v)),
                )
              }
            />
            {t.text}
          </label>
        ))}
        <label className="block text-sm">
          Completion value {(item.metadata as any).unit || ""}
          <input
            type="number"
            step="any"
            min="0"
            className={fieldClass}
            value={value}
            disabled={busy || saved?.completed}
            onChange={(e) => setValue(+e.target.value)}
          />
        </label>
        {saved?.completed ? (
          <p role="status">Completed · saved in Activity</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void save(false)}
            >
              Save occurrence steps
            </Button>
            <Button disabled={busy} onClick={() => void save(true)}>
              Complete Habit
            </Button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <p className="text-xs">
          Checklist history keeps the template snapshot from this occurrence.
          The next period starts unchecked.
        </p>
      </div>
    </SectionCard>
  );
}
export function CheckIn() {
  const { timezone, mutate } = useWorkspace();
  const [mood, setMood] = useState("3"),
    [energy, setEnergy] = useState("3"),
    [pending, setPending] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function save() {
    const input = pending || {
      kind: "check_in",
      clientId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      timezone,
      data: { mood: +mood, energy: +energy },
    };
    setPending(input);
    setBusy(true);
    try {
      await mutate("activities", input);
      setPending(null);
      setMessage("Check-in saved as Activity. You can check in again later.");
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard title="Mood and energy check-in">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {[
            ["Mood", mood, setMood],
            ["Energy", energy, setEnergy],
          ].map(([label, value, setter]) => (
            <label className="text-sm" key={label as string}>
              {label as string}
              <select
                className={fieldClass}
                value={value as string}
                disabled={!!pending}
                onChange={(e) =>
                  (setter as (v: string) => void)(e.target.value)
                }
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <Button disabled={busy} onClick={() => void save()}>
          {pending ? "Retry check-in" : "Save check-in"}
        </Button>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </div>
    </SectionCard>
  );
}

export function HabitsToday({ date }: { date: string }) {
  const { data } = useWorkspace();
  const habits = data.items.filter(
    (i) => i.type === "habit" && !["done", "archived"].includes(i.status),
  );
  if (!habits.length) return null;
  return (
    <SectionCard title="Habits and Routines">
      <div className="space-y-3">
        {habits.map((item) => (
          <details
            key={item.id}
            className="rounded-xl border border-border p-3"
          >
            <summary className="min-h-11 cursor-pointer py-2 font-medium">
              {item.title}
            </summary>
            <div className="space-y-3">
              <Link
                className="inline-flex min-h-11 items-center text-sm underline"
                href={`/app/library/${item.id}`}
              >
                Open {item.title}
              </Link>
              <HabitOccurrence item={item} date={date} />
            </div>
          </details>
        ))}
      </div>
    </SectionCard>
  );
}
