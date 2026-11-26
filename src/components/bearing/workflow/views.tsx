"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Icon } from "../icon";
import { PageHeader, SectionCard } from "../layout";
import {
  activitySummary,
  itemDto,
  itemSeed,
  statusNames,
  typeIcons,
  type ItemRecord,
  type MomentRecord,
  type ProjectRecord,
} from "@/lib/v1/client-model";
import { dateInZone } from "@/lib/v1/dates";
import { DraftNotice, useItemDraft } from "../item-draft-session";
import {
  localDateTime,
  instantFromInput,
  plannedForDay,
} from "@/lib/v1/workflow-dates";
import { useWorkspace, request, fieldClass } from "./context";
import {
  Connections,
  PersonProfile,
  BookmarkReference,
  HabitOccurrence,
  RelationshipReminders,
  CheckIn,
  HabitsToday,
} from "./connections";
import { LinkProposalCards } from "./link-proposals";
import { RelationshipPrompts } from "./relationship-prompts";
import { typeNames } from "./structured-fields";
import {
  localDate as validLocalDate,
  type CanonicalItem,
} from "@/lib/v1/contracts";
import { ReviewComposer } from "./review-composer";
import { TagSelector, ItemEditor } from "./item-editor";
import { itemColor } from "@/lib/product-colors";
import { WorkSurface } from "@/lib/v1/surfaces";
import { Dashboard, Metric, MetricRow, SurfaceGrid, TileGrid } from "./dashboard";

export function ItemCard({
  item,
  context,
  layout = "row",
}: {
  item: ItemRecord;
  context?: string;
  layout?: "row" | "tile";
}) {
  const { mutate, timezone } = useWorkspace(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await mutate(
        `items/${item.id}`,
        {
          revision: item.revision,
          data: {
            ...itemDto(itemSeed(item)),
            status: item.status === "done" ? "todo" : "done",
          },
        },
        "PUT",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      data-slot="item-card"
      className={
        layout === "tile"
          ? "flex min-w-0 flex-col gap-3 rounded-2xl border border-border/70 bg-card p-3"
          : "flex min-w-0 flex-wrap items-start gap-3 rounded-xl border border-border bg-card p-4"
      }
      style={{ borderLeft: `3px solid ${itemColor(item.type)}` }}
      aria-label={item.title}
    >
      <div
        className={
          layout === "tile" ? "flex min-w-0 items-start gap-3" : "contents"
        }
      >
      {item.type === "task" ? (
        <Button
          size="icon"
          variant="outline"
          disabled={busy}
          aria-label={`${item.status === "done" ? "Reopen" : "Complete"} ${item.title}`}
          aria-pressed={item.status === "done"}
          onClick={() => void toggle()}
        >
          <Icon name={item.status === "done" ? "Check" : "Circle"} />
        </Button>
      ) : (
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon name={typeIcons[item.type]} />
        </span>
      )}
      <div className="min-w-0 flex-1 basis-36">
        <Link
          className="break-words font-medium underline-offset-4 hover:underline"
          href={`/app/library/${item.id}`}
        >
          {item.title}
        </Link>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="capitalize">{item.type}</span>
          <span>{statusNames[item.status]}</span>
          <span>
            Priority {item.priority > 0 ? "+" : ""}
            {item.priority}
          </span>
          {context && <span>{context}</span>}
          {item.localDate && <span>Due {item.localDate}</span>}
          {item.dueAt && (
            <span>
              Due{" "}
              {new Date(item.dueAt).toLocaleString(undefined, {
                timeZone: timezone,
              })}
            </span>
          )}
          {item.startAt && (
            <span>
              Starts{" "}
              {new Date(item.startAt).toLocaleString(undefined, {
                timeZone: timezone,
              })}
            </span>
          )}
          {item.endAt && (
            <span>
              Ends{" "}
              {new Date(item.endAt).toLocaleString(undefined, {
                timeZone: timezone,
              })}
            </span>
          )}
          {item.scheduledAt && (
            <span>
              Scheduled{" "}
              {new Date(item.scheduledAt).toLocaleString(undefined, {
                timeZone: timezone,
              })}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {item.directAreas.map((a) => (
            <span key={a.id} className="rounded border border-border px-2 py-1">
              Area · {a.name}
            </span>
          ))}
          {item.inheritedAreas.map((a) => (
            <span
              key={a.id}
              className="rounded border border-dashed border-border px-2 py-1"
            >
              Inherited · {a.name}
            </span>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      </div>
    </article>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-1 text-sm text-muted-foreground">{children}</p>;
}
export function Today({ date }: { date: string }) {
  const { data, timezone } = useWorkspace();
  const { overdue, progress, planned } = WorkSurface.today(
    data.items,
    date,
    timezone,
  );
  const organize = WorkSurface.organizeCount(data.items, data.moments);
  return (
    <Dashboard className="bearing-dense">
      <PageHeader
        title="Today"
        subtitle={`A little direction for ${date}. Your plans stay separate from what happened.`}
        icon="Sun"
      />
      <MetricRow label="Today at a glance">
        <Metric
          label="Overdue"
          value={overdue.length}
          icon="AlarmClock"
          href="#today-overdue"
          detail={overdue.length ? "Original deadlines kept" : "Nothing late"}
        />
        <Metric
          label="In progress"
          value={progress.length}
          icon="Play"
          href="#today-progress"
          detail="Includes delegated"
        />
        <Metric
          label="On the calendar"
          value={planned.length}
          icon="CalendarDays"
          href="#today-calendar"
          detail="Plans, not history"
        />
        <Metric
          label="To organize"
          value={organize}
          icon="Inbox"
          href="/app/inbox"
          detail="Inbox is waiting"
        />
      </MetricRow>
      <SurfaceGrid variant="main">
        <div className="grid gap-4">
          <SectionCard
            id="today-overdue"
            className="h-full"
            title="Overdue"
            icon="AlarmClock"
          >
            <TileGrid>
              {overdue.map((i) => (
                <ItemCard
                  key={i.id}
                  layout="tile"
                  item={i}
                  context="Overdue · original deadline retained"
                />
              ))}
            </TileGrid>
            {!overdue.length && <Empty>No overdue Tasks.</Empty>}
          </SectionCard>
          <SectionCard
            id="today-progress"
            className="h-full"
            title="In progress · including delegated"
            icon="Play"
          >
            <TileGrid>
              {progress.map((i) => (
                <ItemCard key={i.id} layout="tile" item={i} />
              ))}
            </TileGrid>
            {!progress.length && (
              <Empty>Start with one Task when you’re ready.</Empty>
            )}
          </SectionCard>
          <SectionCard
            id="today-calendar"
            className="h-full"
            title="On the calendar"
            icon="CalendarDays"
          >
            <TileGrid>
              {planned.map((i) => (
                <ItemCard
                  key={i.id}
                  layout="tile"
                  item={i}
                  context={plannedForDay(i, date, timezone)!}
                />
              ))}
            </TileGrid>
            {!planned.length && <Empty>Your day is open.</Empty>}
          </SectionCard>
        </div>
        <div className="grid content-start gap-4">
          <SectionCard title="Keep moving" icon="ArrowRight">
            <div className="flex flex-col gap-2 text-sm">
              <Link
                className="inline-flex min-h-11 items-center rounded-xl border border-border/70 bg-background/60 px-3"
                href="/app/inbox"
              >
                {organize} to organize
              </Link>
              <Link
                className="inline-flex min-h-11 items-center rounded-xl border border-border/70 bg-background/60 px-3"
                href="/app/journal"
              >
                Write in your Journal
              </Link>
              <Link
                className="inline-flex min-h-11 items-center rounded-xl border border-border/70 bg-background/60 px-3"
                href="/app/reviews"
              >
                Write a reflection
              </Link>
            </div>
          </SectionCard>
          <RelationshipReminders date={date} />
          <CheckIn />
          <HabitsToday date={date} />
        </div>
      </SurfaceGrid>
      <RelationshipPrompts scope={{ itemIds: [...new Set([...overdue, ...progress, ...planned, ...data.items.filter((item) => item.type === "habit" && item.status !== "archived")].map((item) => item.id))] }} />
    </Dashboard>
  );
}
export function MomentCard({
  moment,
  organize = false,
}: {
  moment: MomentRecord;
  organize?: boolean;
}) {
  const { data, mutate, refresh } = useWorkspace(),
    [type, setType] = useState("task"),
    [title, setTitle] = useState(
      moment.text
        .replace(/^\s*\/(task|note|place)\s*/i, "")
        .trim()
        .split("\n")[0]
        .slice(0, 300),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false);
  const seed = useMemo(
    () => ({
      id: moment.id,
      revision: moment.revision,
      type: "journal-moment",
      title: "Journal moment",
      content: moment.text,
      occurredAt: moment.occurredAt,
      status: "todo",
      metadata: {},
    }),
    [moment],
  );
  const {
    owner,
    draft,
    data: edit,
  } = useItemDraft(`moment:${moment.id}`, seed);
  const refs = [
    ...new Map(moment.items.map((ref) => [ref.itemId, ref])).values(),
  ]
    .map((ref) => data.items.find((item) => item.id === ref.itemId))
    .filter((item): item is ItemRecord => !!item);
  async function classify(item = false) {
    setBusy(true);
    setError("");
    try {
      await mutate(`journal/${moment.id}/organize`, {
        revision: moment.revision,
        ...(item
          ? {
              item: {
                type,
                title,
                content: moment.text,
                status: "todo",
                timezone: moment.timezone,
                metadata: { version: 1 },
              },
            }
          : {}),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveText() {
    const ticket = owner.beginSave(`moment:${moment.id}`);
    if (!ticket) return;
    setBusy(true);
    setError("");
    try {
      const response = await mutate(
        `journal/${moment.id}`,
        {
          revision: ticket.data.revision,
          text: ticket.data.content,
          occurredAt: ticket.data.occurredAt,
          timezone: moment.timezone,
        },
        "PUT",
      );
      owner.complete(
        ticket,
        {
          ...seed,
          revision: response.value.revision,
          content: response.value.text,
          occurredAt: response.value.occurredAt,
        },
        "moment",
      );
      setEditing(false);
    } catch (e) {
      owner.fail(ticket, e);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      id={`moment-${moment.id}`}
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <time dateTime={moment.occurredAt}>
          {new Intl.DateTimeFormat(undefined, {
            timeZone: moment.timezone,
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(moment.occurredAt))}{" "}
          · {moment.timezone}
        </time>
        <Link
          className="underline"
          href={`/app/journal?date=${moment.localDate}&moment=${moment.id}`}
        >
          Open Journal entry
        </Link>
      </div>
      {editing ? (
        <div className="space-y-2">
          <DraftNotice
            noun="Journal entry"
            draft={draft}
            onDiscard={() => owner.discard(`moment:${moment.id}`)}
          />
          <label className="text-sm">
            Occurred at · {moment.timezone}
            <input
              type="datetime-local"
              className={fieldClass}
              value={localDateTime(edit.occurredAt, moment.timezone)}
              onChange={(e) => {
                try {
                  owner.change(`moment:${moment.id}`, {
                    occurredAt: instantFromInput(
                      e.target.value,
                      moment.timezone,
                    ),
                  });
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            />
          </label>
          <label className="text-sm">
            Journal text
            <textarea
              className={`${fieldClass} mt-1`}
              rows={7}
              value={edit.content}
              onChange={(e) =>
                owner.change(`moment:${moment.id}`, { content: e.target.value })
              }
            />
          </label>
          <Button
            disabled={busy || !edit.content.trim()}
            onClick={() => void saveText()}
          >
            Save Journal text
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            Keep draft and close
          </Button>
        </div>
      ) : (
        <>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words dark:prose-invert">
            <ReactMarkdown>{moment.text}</ReactMarkdown>
          </div>
          <Button variant="ghost" onClick={() => setEditing(true)}>
            Edit Journal text
          </Button>
        </>
      )}
      {refs.map((i) => (
        <ItemCard key={i.id} item={i} context="Linked Item" />
      ))}
      <LinkProposalCards momentId={moment.id} faded />
      <RelationshipPrompts scope={{ momentIds: [moment.id] }} proposals={false} />
      {organize && (
        <div className="space-y-3 border-t border-border pt-3">
          {!refs.length && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-sm">
                  Organize as
                  <select
                    className={`${fieldClass} mt-1`}
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                  >
                    <option value="task">Task</option>
                    <option value="note">Note</option>
                  </select>
                </label>
                <label className="text-sm">
                  Title
                  <input
                    className={`${fieldClass} mt-1`}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={300}
                  />
                </label>
              </div>
              <Button
                disabled={busy || !title.trim()}
                onClick={() => void classify(true)}
              >
                Create {type === "task" ? "Task" : "Note"} from entry
              </Button>
            </>
          )}
          <Button
            className="ml-2"
            variant="outline"
            disabled={busy}
            onClick={() => void classify(false)}
          >
            {refs.length ? "Mark organized" : "Keep as Journal entry"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </article>
  );
}
export function Journal({ date }: { date: string }) {
  const { data, timezone, mutate } = useWorkspace(),
    router = useRouter();
  const showActivities = data.preferences.journalActivities !== false;
  const day = WorkSurface.journalDay({
    moments: data.moments,
    activities: data.activities,
    items: data.items,
    date,
    timezone,
    showActivities,
  });
  return (
    <Dashboard className="bearing-dense">
      <div data-slot="journal-bar" className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 p-3">
        <label className="text-sm font-medium">
          Journal date
          <input
            aria-label="Journal date"
            type="date"
            className={`${fieldClass} mt-1`}
            value={date}
            onChange={(e) =>
              e.target.value &&
              router.push(`/app/journal?date=${e.target.value}`)
            }
          />
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showActivities}
            onChange={(e) =>
              void mutate(
                "preferences",
                { journalActivities: e.target.checked },
                "PUT",
              ).catch(() => {})
            }
          />
          Show Activity
        </label>
      </div>
      <MetricRow label="This Journal day">
        <Metric label="Moments" value={day.moments.length} icon="BookOpen" />
        <Metric
          label="Activity"
          value={showActivities ? day.activities.length : "Hidden"}
          icon="Activity"
          detail={showActivities ? "Shown beside moments" : "Turned off"}
        />
        <Metric
          label="Planned"
          value={day.planned.length}
          icon="CalendarDays"
          detail="Not recorded as happened"
        />
        <Metric
          label="Still to organize"
          value={
            day.moments.filter((moment) => moment.needsOrganization).length
          }
          icon="Inbox"
          href="/app/inbox"
        />
      </MetricRow>
      <SurfaceGrid>
        <SectionCard title="What happened" icon="BookOpen" className="h-full">
          <div className="space-y-3">
            {day.timeline.map((entry) =>
              entry.kind === "moment" ? (
                <MomentCard key={entry.id} moment={entry.moment} />
              ) : (
                <article
                  id={`activity-${entry.id}`}
                  key={entry.id}
                  className="rounded-xl border border-border p-4 text-sm"
                >
                  <strong className="capitalize">
                    {entry.activity.kind.replaceAll("_", " ")}
                  </strong>
                  <time className="ml-2 text-xs">
                    {new Date(entry.time).toLocaleTimeString(undefined, {
                      timeZone: entry.activity.timezone || timezone,
                    })}
                  </time>
                  <p>{activitySummary(entry.activity)}</p>
                  {entry.activity.itemId &&
                    data.items.find((i) => i.id === entry.activity.itemId) && (
                      <ItemCard
                        item={data.items.find(
                          (i) => i.id === entry.activity.itemId,
                        )!}
                      />
                    )}
                </article>
              ),
            )}
            {!day.timeline.length && (
              <Empty>No moments yet. Capture a line when you’re ready.</Empty>
            )}
          </div>
        </SectionCard>
        <SectionCard
          title="Planned · not recorded as happened"
          icon="CalendarDays"
          className="h-full"
        >
          <div className="space-y-3">
            {day.planned.map((i) => (
              <ItemCard
                key={i.id}
                layout="tile"
                item={i}
                context={plannedForDay(i, date, timezone)!}
              />
            ))}
            {!day.planned.length && <Empty>No plans for this date.</Empty>}
            <RelationshipPrompts scope={{ itemIds: day.planned.map((item) => item.id) }} />
          </div>
        </SectionCard>
      </SurfaceGrid>
    </Dashboard>
  );
}
export function Inbox() {
  const { data } = useWorkspace();
  const waiting = WorkSurface.inbox(data.items, data.moments);
  return (
    <Dashboard>
      <PageHeader
        title="Inbox"
        icon="Inbox"
        subtitle="Original words first. Organize or clarify when you’re ready."
      />
      <MetricRow label="Inbox load">
        <Metric
          label="Original words"
          value={waiting.moments.length}
          icon="BookOpen"
          detail="Journal text, still raw"
        />
        <Metric
          label="Items waiting"
          value={waiting.items.length}
          icon="Inbox"
          detail="Not already linked above"
        />
        <Metric
          label="To organize"
          value={waiting.moments.length + waiting.items.length}
          icon="ListTodo"
        />
        <Metric
          label="Journal"
          value="Open"
          icon="PenLine"
          href="/app/journal"
          detail="Capture stays separate"
        />
      </MetricRow>
      <SurfaceGrid variant="board">
        <SectionCard title="Original words" icon="BookOpen" className="h-full">
          <div className="space-y-3">
            {waiting.moments.map((m) => (
              <MomentCard key={m.id} moment={m} organize />
            ))}
            {!waiting.moments.length && (
              <Empty>No Journal text is waiting to be organized.</Empty>
            )}
          </div>
        </SectionCard>
        <SectionCard title="Items waiting" icon="Inbox" className="h-full">
          <div className="space-y-3">
            {waiting.items.map((i) => (
              <ItemCard key={i.id} layout="tile" item={i} />
            ))}
            {!waiting.items.length && (
              <Empty>No unlinked Inbox Items.</Empty>
            )}
          </div>
        </SectionCard>
      </SurfaceGrid>
      {!waiting.moments.length && !waiting.items.length && (
        <Empty>Your Inbox is clear.</Empty>
      )}
    </Dashboard>
  );
}
export function Library({ recordId }: { recordId?: string }) {
  const { data } = useWorkspace(),
    params = useSearchParams(),
    router = useRouter();
  const [type, setType] = useState("all"),
    [status, setStatus] = useState("all"),
    [area, setArea] = useState(params.get("area") || "");
  if (recordId === "new")
    return (
      <div className="space-y-4">
        <PageHeader
          title={`New ${typeNames[(params.get("type") || "task") as CanonicalItem["type"]] || "Task"}`}
        />
        {params.get("draft") ? (
          <ItemEditor
            draftKey={`new:${params.get("draft")}`}
            type={
              (Object.keys(typeNames).includes(params.get("type") || "")
                ? params.get("type")
                : "task") as CanonicalItem["type"]
            }
          />
        ) : (
          <p>Preparing editor…</p>
        )}
      </div>
    );
  if (recordId) {
    const item = data.items.find((i) => i.id === recordId);
    return item ? (
      <div className="space-y-5">
        <PageHeader
          title={item.title}
          subtitle={`${item.type} · ${statusNames[item.status]}`}
          icon={typeIcons[item.type]}
        />
        <LinkProposalCards itemId={item.id} faded />
        <RelationshipPrompts scope={{ itemIds: [item.id] }} proposals={false} />
        {item.type === "person" && <PersonProfile item={item} />}
        {item.type === "bookmark" && <BookmarkReference item={item} />}
        <ItemEditor key={item.id} item={item} />
        {item.type === "habit" && (
          <HabitOccurrence
            item={item}
            date={
              validLocalDate.safeParse(params.get("date")).success
                ? params.get("date")!
                : dateInZone(new Date(), item.timezone)
            }
          />
        )}
        <Connections item={item} />
      </div>
    ) : (
      <Empty>This Item is not available in this account.</Empty>
    );
  }
  const tag = params.get("tag");
  const items = WorkSurface.libraryItems(data.items, {
    type,
    status,
    area,
    tag,
  });
  const openWork = WorkSurface.openTasks(data.items).length;
  return (
    <Dashboard>
      <PageHeader
        title="Library"
        icon="Library"
        subtitle="Your saved Tasks, Notes, People and references."
        actions={
          <Link
            className="inline-flex min-h-11 items-center underline text-sm"
            href="/app/graph"
          >
            Explore Graph
          </Link>
        }
      />
      <MetricRow label="Library composition">
        <Metric
          label="Showing"
          value={items.length}
          icon="Library"
          detail={type === "all" ? "Every saved type" : type}
          onClick={() => {
            setType("all");
            setStatus("all");
          }}
          pressed={type === "all" && status === "all"}
        />
        <Metric
          label="Open tasks"
          value={openWork}
          icon="CheckSquare"
          detail="Not done or archived"
        />
        <Metric
          label="In progress"
          value={
            data.items.filter((item) =>
              ["in_progress", "delegated"].includes(item.status),
            ).length
          }
          icon="Play"
          detail="Includes delegated"
          onClick={() => setStatus("in_progress")}
          pressed={status === "in_progress"}
        />
        <Metric
          label="People"
          value={data.items.filter((item) => item.type === "person").length}
          icon="User"
          onClick={() => setType("person")}
          pressed={type === "person"}
        />
      </MetricRow>
      <SectionCard title="Add to the library" icon="Plus">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {Object.entries(typeNames).map(([t, name]) => (
            <Button
              key={t}
              variant={t === "task" ? "default" : "outline"}
              className="h-auto min-h-11 w-full whitespace-normal px-2 py-2"
              onClick={() =>
                router.push(
                  `/app/library/new?type=${t}&draft=${crypto.randomUUID()}`,
                )
              }
            >
              <Icon name={typeIcons[t]} />
              New {name}
            </Button>
          ))}
        </div>
      </SectionCard>
      <div className="grid gap-3 rounded-2xl border border-border/70 bg-card/60 p-3 sm:grid-cols-3">
        <label className="text-xs">
          Type
          <select
            className={fieldClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">All types</option>
            {Object.keys(typeIcons).map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Status
          <select
            className={fieldClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            {Object.entries(statusNames).map(([value, name]) => (
              <option key={value} value={value}>
                {value === "in_progress" ? "In progress + delegated" : name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          Effective Area
          <select
            className={fieldClass}
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">All Areas</option>
            {data.tags
              .filter((t) => t.kind === "area")
              .map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <TileGrid>
        {items.map((i) => (
          <ItemCard key={i.id} layout="tile" item={i} />
        ))}
      </TileGrid>
      {!items.length && <Empty>No Items match these filters.</Empty>}
      <RelationshipPrompts scope={{ itemIds: items.map((item) => item.id) }} />
    </Dashboard>
  );
}
function ProjectForm({
  project,
  onDone,
}: {
  project?: ProjectRecord;
  onDone(): void;
}) {
  const { mutate } = useWorkspace(),
    [name, setName] = useState(project?.name || ""),
    [description, setDescription] = useState(project?.description || ""),
    [tags, setTags] = useState(project?.tags.map((t) => t.tagId) || []),
    [error, setError] = useState("");
  return (
    <form
      className="space-y-3 rounded-xl border border-border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const data = {
            name,
            description,
            tagIds: tags,
            status: project?.status || "active",
          };
          await mutate(
            project ? `projects/${project.id}` : "projects",
            project ? { revision: project.revision, data } : data,
            project ? "PUT" : "POST",
          );
          onDone();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label className="block text-sm">
        Project name
        <input
          required
          className={`${fieldClass} mt-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        Description
        <textarea
          className={`${fieldClass} mt-1`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <TagSelector selected={tags} onChange={setTags} />
      {error && <p role="alert">{error}</p>}
      <Button type="submit">
        {project ? "Save Project" : "Create Project"}
      </Button>
      <Button type="button" variant="ghost" onClick={onDone}>
        Close
      </Button>
    </form>
  );
}
export function Projects({ recordId }: { recordId?: string }) {
  const { data } = useWorkspace(),
    [editing, setEditing] = useState(false);
  const project = data.projects.find((p) => p.id === recordId);
  if (recordId && !project)
    return <Empty>This Project is not available in this account.</Empty>;
  const lanes = project
    ? WorkSurface.projectLanes(data.items, project.id)
    : null;
  const openAcross = data.projects.reduce(
    (sum, entry) => sum + WorkSurface.projectSnapshot(entry, data.items).open,
    0,
  );
  const movingAcross = data.projects.reduce(
    (sum, entry) =>
      sum + WorkSurface.projectSnapshot(entry, data.items).moving,
    0,
  );
  return (
    <Dashboard>
      <PageHeader
        title={project?.name || "Projects"}
        icon="Folder"
        subtitle={
          project?.description ||
          "Curated workspaces, for a season or for years."
        }
        actions={
          <Button onClick={() => setEditing(!editing)}>
            {project ? "Edit Project" : "New Project"}
          </Button>
        }
      />
      <MetricRow label={project ? "This Project" : "Projects at a glance"}>
        {project && lanes ? (
          <>
            <Metric label="To do" value={lanes.waiting.length} icon="Circle" />
            <Metric
              label="In progress"
              value={lanes.moving.length}
              icon="Play"
              detail="Includes delegated"
            />
            <Metric label="Done" value={lanes.finished.length} icon="Check" />
            <Metric
              label="References"
              value={lanes.context.length}
              icon="Link"
              detail="Notes, People and the rest"
            />
          </>
        ) : (
          <>
            <Metric
              label="Projects"
              value={data.projects.length}
              icon="Folder"
            />
            <Metric label="Open tasks" value={openAcross} icon="Circle" />
            <Metric
              label="In progress"
              value={movingAcross}
              icon="Play"
              detail="Includes delegated"
            />
            <Metric
              label="Areas"
              value={
                data.tags.filter((tag) => tag.kind === "area").length
              }
              icon="Tag"
            />
          </>
        )}
      </MetricRow>
      {editing && (
        <ProjectForm project={project} onDone={() => setEditing(false)} />
      )}
      {lanes ? (
        <SurfaceGrid variant="board">
          <SectionCard title="To do" icon="Circle" className="h-full">
            <div className="space-y-3">
              {lanes.waiting.map((i) => (
                <ItemCard key={i.id} layout="tile" item={i} />
              ))}
              {!lanes.waiting.length && <Empty>Nothing waiting.</Empty>}
            </div>
          </SectionCard>
          <SectionCard
            title="In progress · including delegated"
            icon="Play"
            className="h-full"
          >
            <div className="space-y-3">
              {lanes.moving.map((i) => (
                <ItemCard key={i.id} layout="tile" item={i} />
              ))}
              {!lanes.moving.length && <Empty>Nothing in motion.</Empty>}
            </div>
          </SectionCard>
          <SectionCard title="Done" icon="Check" className="h-full">
            <div className="space-y-3">
              {lanes.finished.map((i) => (
                <ItemCard key={i.id} layout="tile" item={i} />
              ))}
              {!lanes.finished.length && <Empty>Nothing finished yet.</Empty>}
            </div>
          </SectionCard>
          <SectionCard title="References" icon="Link" className="h-full">
            <div className="space-y-3">
              {lanes.context.map((i) => (
                <ItemCard key={i.id} layout="tile" item={i} />
              ))}
              {!lanes.context.length && (
                <Empty>No Notes, Habits or other references.</Empty>
              )}
            </div>
          </SectionCard>
        </SurfaceGrid>
      ) : (
        <SurfaceGrid variant="cards">
          {data.projects.map((p) => {
            const snapshot = WorkSurface.projectSnapshot(p, data.items);
            return (
              <Link
                className="flex h-full flex-col rounded-2xl border border-border/70 bg-card p-4"
                href={`/app/projects/${p.id}`}
                key={p.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-semibold">{p.name}</h2>
                  <span className="text-xs capitalize text-muted-foreground">
                    {p.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {p.description}
                </p>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-background/70 px-2 py-2">
                    <dt className="text-xs text-muted-foreground">Open</dt>
                    <dd
                      data-slot="metric-value"
                      className="text-xl leading-none"
                    >
                      {snapshot.open}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-background/70 px-2 py-2">
                    <dt className="text-xs text-muted-foreground">Moving</dt>
                    <dd
                      data-slot="metric-value"
                      className="text-xl leading-none"
                    >
                      {snapshot.moving}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-background/70 px-2 py-2">
                    <dt className="text-xs text-muted-foreground">Done</dt>
                    <dd
                      data-slot="metric-value"
                      className="text-xl leading-none"
                    >
                      {snapshot.done}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs">
                  {snapshot.areas.join(" · ") || "No Areas assigned"}
                </p>
              </Link>
            );
          })}
        </SurfaceGrid>
      )}
      {!project && !data.projects.length && (
        <Empty>No Projects yet. Create one when a body of work needs a home.</Empty>
      )}
      <RelationshipPrompts scope={{
        projectIds: project ? [project.id] : data.projects.map((entry) => entry.id),
        itemIds: project ? data.items.filter((item) => item.projectId === project.id).map((item) => item.id) : [],
      }} />
    </Dashboard>
  );
}
export function Calendar({ date }: { date: string }) {
  const { data, timezone } = useWorkspace(),
    router = useRouter();
  const agenda = WorkSurface.agenda(data.items, date, timezone);
  const week = WorkSurface.weekContaining(date);
  const lanes = [
    ["Events", "Event plans for this date.", agenda.events],
    ["Scheduled", "Work placed on this date.", agenda.scheduled],
    ["Due", "Deadlines that land today.", agenda.due],
  ] as const;
  return (
    <Dashboard>
      <PageHeader
        title="Calendar & Agenda"
        icon="CalendarDays"
        subtitle="Tasks, deadlines and Event plans, together."
      />
      <section
        aria-label={`Week of ${week[0]}`}
        className="rounded-2xl border border-border/70 bg-card/70 p-3"
      >
        <div className="flex gap-2 overflow-x-auto pb-1">
          {week.map((day) => (
            <Button
              key={day}
              variant={day === date ? "default" : "outline"}
              className="h-auto min-w-16 flex-1 flex-col px-2 py-2"
              aria-current={day === date ? "date" : undefined}
              onClick={() => router.push(`/app/calendar?date=${day}`)}
            >
              <span className="text-xs font-medium">
                {WorkSurface.formatDay(day, { weekday: "short" })}
              </span>
              <span>{day.slice(8)}</span>
            </Button>
          ))}
        </div>
        <label className="mt-3 block max-w-xs text-sm">
          Calendar date
          <input
            type="date"
            className={`${fieldClass} mt-1`}
            value={date}
            onChange={(e) =>
              e.target.value &&
              router.push(`/app/calendar?date=${e.target.value}`)
            }
          />
        </label>
      </section>
      <MetricRow label="This date">
        <Metric label="On the agenda" value={agenda.rows.length} icon="CalendarDays" />
        <Metric label="Events" value={agenda.events.length} icon="Calendar" />
        <Metric label="Scheduled" value={agenda.scheduled.length} icon="Clock" />
        <Metric label="Due" value={agenda.due.length} icon="AlarmClock" />
      </MetricRow>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {lanes.map(([title, hint, rows]) => (
          <SectionCard key={title} title={title} className="h-full">
            <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
            <div className="space-y-3">
              {rows.map((row) => (
                <ItemCard
                  key={row.item.id}
                  layout="tile"
                  item={row.item}
                  context={row.context}
                />
              ))}
              {!rows.length && <Empty>Nothing in this lane.</Empty>}
            </div>
          </SectionCard>
        ))}
      </div>
      {!agenda.rows.length && (
        <Empty>No scheduled work, deadlines or Event plans on this date.</Empty>
      )}
      <RelationshipPrompts scope={{ itemIds: agenda.rows.map((row) => row.item.id) }} />
    </Dashboard>
  );
}
export function Search({ coach = false }: { coach?: boolean }) {
  const { userId, data } = useWorkspace(),
    params = useSearchParams(),
    router = useRouter();
  const [q, setQ] = useState(params.get("q") || ""),
    [kind, setKind] = useState(params.get("kind") || "all"),
    [area, setArea] = useState(params.get("areaId") || ""),
    [project, setProject] = useState(params.get("projectId") || "");
  const query = params.get("q") || "",
    key = params.toString();
  const results = useQuery({
    queryKey: ["v1-search", userId, key],
    enabled: !!query.trim(),
    queryFn: ({ signal }) =>
      request<
        {
          id: string;
          title: string;
          excerpt: string;
          kind: string;
          href: string;
        }[]
      >(userId, `search?${key}`, { signal }),
  });
  return (
    <div className="space-y-5">
      <PageHeader
        title={coach ? "Coach · find context" : "Search"}
        icon={coach ? "Sparkles" : "Search"}
        subtitle={
          coach
            ? "Look up your saved information. This lookup uses keywords and makes no automatic changes."
            : "Keyword search across your Items, Projects, Journal, Reviews, Activity and Tags."
        }
      />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const p = new URLSearchParams({ q, kind });
          if (area) p.set("areaId", area);
          if (project) p.set("projectId", project);
          router.push(`/app/${coach ? "coach" : "search"}?${p}`);
        }}
      >
        <label className="block text-sm">
          Keywords
          <input
            className={`${fieldClass} mt-1`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">
            Record kind
            <select
              className={fieldClass}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {[
                "all",
                "item",
                "project",
                "journal",
                "review",
                "activity",
                "tag",
              ].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            Area
            <select
              className={fieldClass}
              value={area}
              onChange={(e) => setArea(e.target.value)}
            >
              <option value="">All Areas</option>
              {data.tags
                .filter((t) => t.kind === "area")
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-xs">
            Project
            <select
              className={fieldClass}
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              <option value="">All Projects</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button disabled={!q.trim()}>Search records</Button>
      </form>
      {results.isFetching && <p role="status">Searching…</p>}
      {results.error && <p role="alert">{results.error.message}</p>}
      {results.data?.map((r) => (
        <Link
          className="block rounded-xl border border-border p-4"
          href={r.href}
          key={`${r.kind}-${r.id}`}
        >
          <p className="text-xs capitalize text-muted-foreground">{r.kind}</p>
          <h2 className="font-medium">{r.title}</h2>
          <p className="break-words text-sm text-muted-foreground">
            {r.excerpt}
          </p>
        </Link>
      ))}
      {results.data?.length === 0 && (
        <Empty>
          No matching records in this account. Try fewer keywords or different
          filters.
        </Empty>
      )}
      <RelationshipPrompts scope={{
        itemIds: results.data?.filter((result) => result.kind === "item").map((result) => result.id),
        momentIds: results.data?.filter((result) => result.kind === "journal").map((result) => result.id),
        projectIds: results.data?.filter((result) => result.kind === "project").map((result) => result.id),
      }} />
    </div>
  );
}
function ReviewBody({ review }: { review: { prompts: Record<string, unknown> } }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Object.entries(review.prompts).map(([key, value]) => (
        <section
          key={key}
          className="rounded-xl border border-border/70 bg-background/50 p-3"
        >
          <h3 className="text-xs font-semibold capitalize">{key}</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">
            {Array.isArray(value) ? value.join("\n") : String(value)}
          </p>
        </section>
      ))}
    </div>
  );
}
export function Reviews({ recordId }: { recordId?: string }) {
  const { data } = useWorkspace();
  const reviews = data.reviews.filter((r) => !recordId || r.id === recordId);
  const counts = WorkSurface.reviewCounts(data.reviews);
  const recent = WorkSurface.sortedReviews(data.reviews);
  return (
    <Dashboard>
      <PageHeader
        title="Reviews"
        icon="ClipboardList"
        subtitle="Pause and reflect. Separate from your daily log and check-ins."
      />
      <MetricRow label="Reflections">
        <Metric label="Saved" value={counts.total} icon="ClipboardList" />
        <Metric label="Daily" value={counts.daily} icon="Sun" />
        <Metric label="Weekly" value={counts.weekly} icon="CalendarDays" />
        <Metric label="Monthly" value={counts.monthly} icon="Calendar" />
      </MetricRow>
      {recordId ? (
        <Link
          className="inline-flex min-h-11 items-center underline"
          href="/app/reviews"
        >
          All Reviews · write a reflection
        </Link>
      ) : (
        <SurfaceGrid variant="main">
          <ReviewComposer />
          <SectionCard title="Recent reflections" icon="Library" className="h-full">
            <div className="space-y-3">
              {recent.map((review) => (
                <article
                  key={review.id}
                  className="rounded-xl border border-border/70 bg-background/40 p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold capitalize">
                      {review.period} · {review.localDate}
                    </h3>
                    <Link
                      className="text-sm underline"
                      href={`/app/reviews/${review.id}`}
                    >
                      Open reflection
                    </Link>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {WorkSurface.reviewExcerpt(review)}
                  </p>
                  <details className="mt-2">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm">
                      Read prompts here
                    </summary>
                    <ReviewBody review={review} />
                  </details>
                </article>
              ))}
              {!recent.length && (
                <Empty>No matching Review in this account.</Empty>
              )}
            </div>
          </SectionCard>
        </SurfaceGrid>
      )}
      {recordId &&
        reviews.map((r) => (
          <SectionCard key={r.id} title={`${r.period} · ${r.localDate}`}>
            <ReviewBody review={r} />
          </SectionCard>
        ))}
      {recordId && !reviews.length && (
        <Empty>No matching Review in this account.</Empty>
      )}
    </Dashboard>
  );
}
