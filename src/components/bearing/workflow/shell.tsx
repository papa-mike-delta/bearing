"use client";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ConnectedFocus, ConnectedGraph } from "./perspectives";
import { ConversationalCoach } from "./coach";
import { DataSettings } from "./data-settings";
import { Appearance } from "./appearance";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StoredThemeOverride } from "@/components/theme-override";
import { Icon } from "../icon";
import { useDraftSession } from "../item-draft-session";
import { PageHeader, SectionCard } from "../layout";
import { outbox, type OutboxEntry, type Identity } from "@/lib/v1/outbox";
import { dateInZone } from "@/lib/v1/dates";
import { localDate } from "@/lib/v1/contracts";
import type { Workspace } from "@/lib/v1/client-model";
import { LinkProposals } from "@/lib/v1/link-proposals";
import { trustPatterns } from "@/lib/v1/coach/trust-catalog";
import { WorkspaceContext, useWorkspace, request, fieldClass } from "./context";
import { CaptureComposer } from "./capture";
import {
  Today,
  Journal,
  Inbox,
  Library,
  Projects,
  Calendar,
  Search,
  Reviews,
} from "./views";
const navGroups: { label: string; items: [string, string, string][] }[] = [
  {
    label: "Day",
    items: [
      ["today", "Today", "Sun"],
      ["journal", "Journal", "BookOpen"],
      ["inbox", "Inbox", "Inbox"],
    ],
  },
  {
    label: "Work",
    items: [
      ["projects", "Projects", "Folder"],
      ["library", "Library", "Library"],
      ["calendar", "Calendar", "CalendarDays"],
      ["focus", "Focus", "Timer"],
    ],
  },
  {
    label: "Reflect",
    items: [
      ["reviews", "Reviews", "ClipboardList"],
      ["graph", "Graph", "Network"],
      ["coach", "Coach", "Sparkles"],
    ],
  },
];
export function WorkflowShell(props: {
  userId: string;
  view: string;
  recordId?: string;
}) {
  const session = useDraftSession();
  if (session.userId !== props.userId)
    return (
      <main className="space-y-4 p-8">
        <h1 className="text-2xl font-semibold">Confirm your account</h1>
        <p>Your session changed. Reload to open your current account.</p>
        <Button onClick={() => window.location.reload()}>
          Reload workspace
        </Button>
      </main>
    );
  return <Content {...props} />;
}
function Content({
  userId,
  view,
  recordId,
}: {
  userId: string;
  view: string;
  recordId?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const client = useQueryClient(),
    { owner } = useDraftSession(),
    router = useRouter(),
    params = useSearchParams();
  const [identity, setIdentity] = useState<Identity | null>(null),
    [bootError, setBootError] = useState(""),
    [locked, setLocked] = useState(false),
    [captureOpen, setCaptureOpen] = useState(false),
    [menu, setMenu] = useState(false),
    [queue, setQueue] = useState<OutboxEntry[]>([]),
    [ready, setReady] = useState(false),
    [syncStatus, setSyncStatus] = useState(""),
    [logout, setLogout] = useState(false);
  const active = useRef(true),
    offlineReady = useRef(false);
  const refresh = useCallback(async () => {
    await client.invalidateQueries({ queryKey: ["v1-workspace", userId] });
    await client.invalidateQueries({ queryKey: ["v1-search", userId] });
  }, [client, userId]);
  const loadQueue = useCallback(async () => {
    try {
      const rows = await outbox.listEntries(userId);
      if (active.current) setQueue(rows);
    } catch (e) {
      if (active.current) setBootError((e as Error).message);
    }
  }, [userId]);
  const sync = useCallback(
    async (retryErrors = false) => {
      try {
        const result = await outbox.syncOutbox(userId, { retryErrors });
        if (!active.current) return;
        if (result.locked) {
          setLocked(true);
          return;
        }
        setSyncStatus(
          result.offline
            ? "Offline · captures stay on this device"
            : result.unavailable
              ? "Server unavailable · captures retained"
              : "Connected",
        );
        await loadQueue();
        if (result.synced) await refresh();
      } catch (e) {
        if (active.current) setSyncStatus((e as Error).message);
      }
    },
    [userId, refresh, loadQueue],
  );
  useEffect(() => {
    active.current = true;
    let live = true;
    request<Identity & { timezone?: string }>(userId, "identity")
      .then(async (value) => {
        if (!live || !active.current) return;
        try {
          const resolved = {
            ...value,
            timezone:
              value.timezone ||
              Intl.DateTimeFormat().resolvedOptions().timeZone,
          };
          await outbox.activateAccount(resolved);
          if (!live || !active.current) return;
          setIdentity(resolved);
          await loadQueue();
          await sync();
        } catch (e) {
          setBootError(`Device storage unavailable. ${(e as Error).message}`);
        }
      })
      .catch((e) => live && setBootError(e.message));
    const changed = async () => {
      const current = await outbox.activeAccount();
      if (!live) return;
      if (!current || current.userId !== userId) {
        active.current = false;
        setLocked(true);
        owner.clear();
        client.clear();
      } else await loadQueue();
    };
    const event = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === "locked") {
        active.current = false;
        setLocked(true);
        owner.clear();
        client.clear();
      } else void changed();
    };
    window.addEventListener(outbox.channelName, event);
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(outbox.channelName)
        : null;
    if (channel) channel.onmessage = () => void changed();
    const online = () => void sync();
    const offline = () => {
      setSyncStatus("Offline · captures stay on this device");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const timer = setInterval(() => void sync(), 30_000);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/bearing-sw.js", { type: "module", scope: "/" })
        .then(() => navigator.serviceWorker.ready)
        .then(() => {
          if (live) {
            offlineReady.current = true;
            setReady(true);
          }
        })
        .catch(
          () =>
            live &&
            setSyncStatus(
              "Offline reload is unavailable. Keep this page open to retain local captures.",
            ),
        );
    return () => {
      live = false;
      active.current = false;
      clearInterval(timer);
      channel?.close();
      window.removeEventListener(outbox.channelName, event);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [userId, client, owner, loadQueue, sync]);
  const workspace = useQuery({
    queryKey: ["v1-workspace", userId],
    enabled: !!identity && !locked,
    queryFn: ({ signal }) =>
      request<Workspace>(userId, "workspace", { signal }),
  });
  const zone =
    workspace.data?.preferences.timezone ||
    (identity as Identity & { timezone?: string })?.timezone ||
    "UTC";
  const proposals = useMemo(() => workspace.data ? LinkProposals.infer(workspace.data) : [], [workspace.data]);
  const requested = params.get("date"),
    date =
      requested && localDate.safeParse(requested).success
        ? requested
        : dateInZone(new Date(), zone);
  useEffect(() => {
    if (view === "library" && recordId === "new" && !params.get("draft"))
      router.replace(
        `/app/library/new?type=${["task", "note", "person", "bookmark", "habit", "event", "goal"].includes(params.get("type") || "") ? params.get("type") : "task"}&draft=${crypto.randomUUID()}`,
      );
    const target = params.get("moment")
      ? `moment-${params.get("moment")}`
      : params.get("activity")
        ? `activity-${params.get("activity")}`
        : null;
    if (target && workspace.data)
      requestAnimationFrame(() =>
        document.getElementById(target)?.scrollIntoView({ block: "center" }),
      );
  }, [view, recordId, params, router, workspace.data]);
  const openCapture = useCallback(() => {
    if (view === "journal") {
      const field = document.querySelector<HTMLElement>(
        'section[aria-label="Write a Journal moment"] textarea, section[aria-label="Write a Journal moment"] [contenteditable="true"]',
      );
      field?.focus();
      field?.scrollIntoView({ block: "center" });
    } else setCaptureOpen(true);
  }, [view]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCapture();
      }
      if (
        event.key === "/" &&
        !(event.target as HTMLElement).closest(
          "input,textarea,[contenteditable]",
        )
      ) {
        event.preventDefault();
        document.getElementById("workspace-search")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCapture]);
  async function signOut() {
    setLogout(false);
    await outbox.lockAccount();
    owner.clear();
    client.clear();
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out failed");
      window.location.replace(new URL("/login", window.location.origin).href);
    } catch {
      setLocked(true);
      setBootError("This device is locked. Connect to finish signing out.");
    }
  }
  if (locked)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-8">
        <h1 className="text-2xl font-semibold">Confirm your account</h1>
        <p>
          {bootError ||
            "The signed-in session changed. Saved device captures stay with their original account."}
        </p>
        <Button
          onClick={() =>
            window.location.replace(
              new URL("/app", window.location.origin).href,
            )
          }
        >
          Continue online
        </Button>
        <Button variant="outline" onClick={() => void signOut()}>
          Finish signing out
        </Button>
      </main>
    );
  if (!identity || !workspace.data)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-8">
        <h1 className="text-2xl font-semibold">Opening your workspace</h1>
        {bootError || workspace.error ? (
          <>
            <p role="alert">{bootError || workspace.error?.message}</p>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </>
        ) : (
          <p role="status">
            Checking your account and loading your information…
          </p>
        )}
      </main>
    );
  const dirtyDrafts = Object.values(owner.store.getState().drafts).filter(
    (draft) => draft.dirtyFields.length,
  ).length;
  const data = workspace.data,
    pending = queue.filter((r) => r.status !== "synced");
  const mutate = async <T,>(
    path: string,
    body: unknown,
    method = "POST",
  ): Promise<T> => {
    try {
      const response = await request<T>(userId, path, {
        method,
        body: JSON.stringify(body),
      });
      await refresh();
      return response;
    } catch (error) {
      await refresh();
      throw error;
    }
  };
  const me = data.items.find(item => item.selfProfile?.userId === userId);
  const linkClass = (active: boolean) =>
    `flex min-h-8 items-center gap-2 rounded-lg px-2 text-sm ${active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`;
  const navigation = (
    <nav aria-label="Main navigation" className="flex flex-col">
      {navGroups.map((group) => (
        <div key={group.label} className="pt-3 first:pt-0">
          <p className="bearing-eyebrow px-2 pb-1 text-xs font-semibold uppercase tracking-[0.16em]">
            {group.label}
          </p>
          <div className="flex flex-col gap-0.5">
            {group.items.map(([route, name, icon]) => (
              <Link
                key={route}
                href={`/app/${route}`}
                data-slot="sidebar-link"
                onClick={() => setMenu(false)}
                aria-current={view === route ? "page" : undefined}
                className={linkClass(view === route)}
              >
                <Icon name={icon} className={`h-4 w-4 shrink-0 ${view === route ? "text-primary" : "opacity-80"}`} />
                {name}
              </Link>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-3 border-t border-border/60 pt-2">
        <div className="flex flex-col gap-0.5">
          <Link
            href="/app/settings"
            data-slot="sidebar-link"
            onClick={() => setMenu(false)}
            aria-current={view === "settings" ? "page" : undefined}
            className={linkClass(view === "settings")}
          >
            <Icon name="Settings" className={`h-4 w-4 shrink-0 ${view === "settings" ? "text-primary" : "opacity-80"}`} />
            Settings
          </Link>
          {me && (
            <Link
              href={`/app/library/${me.id}`}
              data-slot="sidebar-link"
              onClick={() => setMenu(false)}
              aria-current={recordId === me.id ? "page" : undefined}
              className={linkClass(recordId === me.id)}
            >
              <Icon name="User" className={`h-4 w-4 shrink-0 ${recordId === me.id ? "text-primary" : "opacity-80"}`} />
              Me
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
  return (
    <WorkspaceContext.Provider
      value={{ userId, data, proposals, timezone: zone, refresh, mutate }}
    >
      <StoredThemeOverride>
      <div className="bearing-app flex min-h-dvh min-w-0 bg-background text-foreground">
        <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:p-4">Skip to workspace</a>
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-md md:flex">
          <Link
            href="/app/today"
            className="flex items-center gap-2 px-3 pt-4 pb-2 text-[15px] font-semibold tracking-tight"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Icon name="Brain" className="h-4 w-4" />
            </span>
            bearing.now
          </Link>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">{navigation}</div>
          <div className="space-y-1 border-t border-sidebar-border px-2 py-3">
            <p className="truncate px-2 text-xs text-muted-foreground" title={identity?.email}>
              {identity?.email}
            </p>
            <Button variant="ghost" size="sm" className="w-full justify-start px-2 text-muted-foreground" onClick={() => setLogout(true)}>
              Sign out
            </Button>
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex flex-nowrap items-center gap-1.5 border-b border-border/70 bg-background/75 px-2 py-1.5 backdrop-blur-md md:gap-2 md:px-4 md:py-2.5">
            <Button
              className="md:hidden"
              variant="outline"
              size="icon"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Icon name="Menu" />
            </Button>
            <form action="/app/search" className="min-w-0 flex-1">
              <label className="sr-only" htmlFor="workspace-search">
                Search your information
              </label>
              <input
                id="workspace-search"
                name="q"
                className={fieldClass}
                placeholder="Search your information…"
              />
            </form>
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0"
              aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              <Icon name={resolvedTheme === "dark" ? "Sun" : "Moon"} />
            </Button>
            <Button onClick={openCapture} aria-label="Quick Capture" className="shrink-0 px-3 md:px-4">
              <Icon name="Zap" className="h-4 w-4" />
              <span className="md:hidden">Capture</span>
              <span className="hidden md:inline">Quick Capture</span>
            </Button>
          </header>
          <main id="workspace-content" tabIndex={-1} className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 md:space-y-6 md:px-6 md:py-8">
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span role="status" title="Captures sync when saved to your account">
                {syncStatus || "Connected"}
              </span>
              <span aria-hidden="true">·</span>
              {ready ? (
                <a className="underline decoration-border underline-offset-2" href="/offline.html">
                  Available offline · open device Journal
                </a>
              ) : (
                <span>Preparing offline capture…</span>
              )}
            </p>
            {workspace.error && (
              <p role="alert">
                Refresh failed: {workspace.error.message}. Your open drafts are
                retained.
              </p>
            )}
            {pending.length > 0 && (
              <section aria-label="Capture sync status" className="space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {pending.length} pending ·{" "}
                    {queue.filter((r) => r.status === "synced").length} synced on
                    this device
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void sync(true)}>
                    Retry sync
                  </Button>
                </div>
                {pending.map((r) => (
                  <article
                    className="rounded-xl border border-border/70 bg-card/70 p-3 text-sm"
                    key={r.clientId}
                  >
                    <strong>
                      {r.status === "error" ? "Needs attention" : "Pending sync"}
                    </strong>
                    <p className="whitespace-pre-wrap break-words">{r.text}</p>
                    {r.error && <p role="alert">{r.error}</p>}
                  </article>
                ))}
              </section>
            )}
            {view === "journal" && (
              <PageHeader
                title="Daily Journal"
                subtitle="A living log of your day. Backdate a moment without changing when it was captured."
                icon="BookOpen"
              />
            )}
            <CaptureComposer
              inline={view === "journal"}
              open={captureOpen}
              onOpenChange={setCaptureOpen}
              date={date}
              sync={() => sync()}
            />
            {view === "today" ? (
              <Today date={date} />
            ) : view === "journal" ? (
              <Journal date={date} />
            ) : view === "inbox" ? (
              <Inbox />
            ) : view === "library" ? (
              <Library recordId={recordId} />
            ) : view === "projects" ? (
              <Projects key={recordId || "all"} recordId={recordId} />
            ) : view === "calendar" ? (
              <Calendar date={date} />
            ) : view === "focus" ? (
              <ConnectedFocus />
            ) : view === "graph" ? (
              <ConnectedGraph />
            ) : view === "coach" ? (
              <ConversationalCoach />
            ) : view === "search" ? (
              <Search key={`${view}:${params.toString()}`} />
            ) : view === "reviews" ? (
              <Reviews recordId={recordId} />
            ) : (
              <Settings onSignOut={() => setLogout(true)} />
            )}
          </main>
        </div>
        <Dialog open={menu} onOpenChange={setMenu}>
          <DialogContent className="max-h-[85dvh] overflow-hidden p-4 sm:max-w-sm">
            <div className="flex h-[calc(85dvh-2rem)] min-h-0 flex-col gap-3">
              <DialogHeader className="shrink-0 gap-1">
                <DialogTitle>Navigation</DialogTitle>
                <DialogDescription>Open a view.</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {navigation}
              </div>
              <p className="shrink-0 truncate text-xs text-muted-foreground">{identity?.email}</p>
              <Button
                variant="ghost"
                className="shrink-0 justify-start px-2 text-muted-foreground"
                onClick={() => {
                  setMenu(false);
                  setLogout(true);
                }}
              >
                Sign out
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={logout} onOpenChange={setLogout}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign out of this account?</DialogTitle>
              <DialogDescription>
                {pending.length
                  ? `${pending.length} unsynced capture${pending.length === 1 ? "" : "s"} will remain on this device for ${identity?.email}. They will not sync into another account. Sign back into this account online to resume.`
                  : "Saved device captures stay separate from other accounts."}
                {dirtyDrafts > 0 &&
                  " Unsaved editor changes will be discarded. Stay signed in to save or capture them first."}
              </DialogDescription>
            </DialogHeader>
            <Button onClick={() => void signOut()}>
              Keep device captures and sign out
            </Button>
            <Button variant="outline" onClick={() => setLogout(false)}>
              Stay signed in
            </Button>
          </DialogContent>
        </Dialog>
      </div>
      </StoredThemeOverride>
    </WorkspaceContext.Provider>
  );
}
function CoachTrustSettings() {
  const { data } = useWorkspace(),
    trust = data.trust ?? { version: 1 as const, revision: 0, patterns: [] },
    [saved, setSaved] = useState(false),
    [error, setError] = useState("");
  return (
    <CoachTrustForm
      key={`${trust.revision}:${trust.patterns.join(",")}`}
      revision={trust.revision}
      patterns={trust.patterns}
      saved={saved}
      error={error}
      onSaved={() => setSaved(true)}
      onEdit={() => setSaved(false)}
      onError={setError}
    />
  );
}
function CoachTrustForm({
  revision,
  patterns,
  saved,
  error,
  onSaved,
  onEdit,
  onError,
}: {
  revision: number;
  patterns: string[];
  saved: boolean;
  error: string;
  onSaved(): void;
  onEdit(): void;
  onError(message: string): void;
}) {
  const { mutate } = useWorkspace(),
    [selected, setSelected] = useState(patterns);
  return (
    <SectionCard title="Coach trust">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onError("");
          onEdit();
          void mutate(
            "coach/trust",
            { revision, patterns: selected },
            "PUT",
          )
            .then(() => onSaved())
            .catch((err: Error) => onError(err.message));
        }}
      >
        <p className="text-sm text-muted-foreground">
          Off until you opt in. Each choice lets a fresh Coach proposal save
          exactly one matching operation, and only that effect. An edited
          proposal, an older pending card, and every other change still wait
          for approval. Restoring a backup turns these off until you opt in
          again. Your other preferences come back. Turning a choice off does
          not undo a change already saved.
        </p>
        {trustPatterns.map((pattern) => (
          <label
            key={pattern.id}
            className="flex min-h-11 items-start gap-2 text-sm"
          >
            <input
              className="mt-1"
              type="checkbox"
              checked={selected.includes(pattern.id)}
              onChange={(e) => {
                onEdit();
                setSelected((current) =>
                  e.target.checked
                    ? [...current, pattern.id]
                    : current.filter((id) => id !== pattern.id),
                );
              }}
            />
            <span>
              <span className="font-medium">{pattern.title}</span>
              <span className="mt-1 block text-muted-foreground">
                {pattern.effect}
              </span>
            </span>
          </label>
        ))}
        <Button>Save Coach trust</Button>
        {saved && <p role="status">Coach trust saved for this account.</p>}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
      </form>
    </SectionCard>
  );
}
function Settings({ onSignOut }: { onSignOut(): void }) {
  const { data, timezone, mutate } = useWorkspace(),
    [startup, setStartup] = useState(data.preferences.startup || "today"),
    [zone, setZone] = useState(timezone),
    [name, setName] = useState(""),
    [kind, setKind] = useState("area"),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  async function action(fn: () => Promise<any>) {
    setError("");
    setSaved(false);
    try {
      await fn();
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        icon="Settings"
        subtitle="Where the day opens, how it looks, and a copy of your records."
      />
      <SectionCard title="Start your day">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action(() =>
              mutate("preferences", { startup, timezone: zone }, "PUT"),
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-muted-foreground">
              Startup view
              <select
                className={`${fieldClass} mt-1`}
                value={startup}
                onChange={(e) => setStartup(e.target.value)}
              >
                {[
                  "today",
                  "journal",
                  "inbox",
                  "projects",
                  "library",
                  "calendar",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-muted-foreground">
              Timezone
              <input
                className={`${fieldClass} mt-1`}
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="America/New_York"
              />
            </label>
          </div>
          <Button>Save preferences</Button>
        </form>
      </SectionCard>
      <SectionCard title="Appearance">
        <Appearance />
      </SectionCard>
      <SectionCard title="Areas and Tags">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              await mutate("tags", { name, kind });
              setName("");
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-muted-foreground">
              Name
              <input
                className={`${fieldClass} mt-1`}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block text-sm text-muted-foreground">
              Kind
              <select
                className={`${fieldClass} mt-1`}
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="area">Area · an enduring responsibility</option>
                <option value="tag">Tag · a flexible topic</option>
              </select>
            </label>
          </div>
          <Button>Create label</Button>
        </form>
      </SectionCard>
      <CoachTrustSettings />
      <DataSettings />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {saved && <p role="status">Saved.</p>}
      <Button variant="ghost" className="text-muted-foreground" onClick={onSignOut}>
        Sign out
      </Button>
    </div>
  );
}
