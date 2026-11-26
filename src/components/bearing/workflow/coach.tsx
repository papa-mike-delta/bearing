"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionCard } from "../layout";
import { useWorkspace, request, fieldClass } from "./context";
import { outbox } from "@/lib/v1/outbox";
import { typeNames, newItemSeed } from "./structured-fields";
import { StructuredFields } from "./structured-fields";
import { TagSelector } from "./item-editor";
import type {
  Answer,
  Draft,
  Operation,
  Source,
} from "@/lib/v1/coach/contracts";
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Coach is unavailable";
type ChatMessage = Partial<Answer> & { id: string; role: string; text: string };
export function ConversationalCoach() {
  const { userId, refresh } = useWorkspace(),
    params = useSearchParams(),
    router = useRouter(),
    conversationId = params.get("conversation") || undefined;
  const [retrying, setRetrying] = useState(false);
  const [config, setConfig] = useState<any>(null),
    [conversations, setConversations] = useState<any[]>([]),
    [memories, setMemories] = useState<{ id: string; text: string }[]>([]),
    [messages, setMessages] = useState<ChatMessage[]>([]),
    [drafts, setDrafts] = useState<Draft[]>([]),
    [temporary, setTemporary] = useState(false),
    [consent, setConsent] = useState(false),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [streaming, setStreaming] = useState(""),
    [sources, setSources] = useState<Source[]>([]),
    [memoryText, setMemoryText] = useState("");
  const abort = useRef<AbortController | null>(null),
    pending = useRef<{
      clientId: string;
      text: string;
      conversationId?: string;
    } | null>(null),
    selected = useRef<{ kind: string; id: string }[]>([]);
  const reload = useCallback(async () => {
    const [c, list, m] = await Promise.all([
      request(userId, "coach/config"),
      request<any[]>(userId, "coach/conversations"),
      request<{ id: string; text: string }[]>(userId, "coach/memory"),
    ]);
    setConfig(c);
    setConversations(list);
    setMemories(m);
  }, [userId]);
  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(reload)
      .catch((e) => active && setError(message(e)));
    return () => {
      active = false;
      abort.current?.abort();
    };
  }, [reload]);
  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    void request<any>(userId, `coach/conversations/${conversationId}`)
      .then((value) => {
        if (active) {
          setMessages(value.messages);
          setDrafts(value.drafts);
          setTemporary(false);
        }
      })
      .catch((e) => active && setError(message(e)));
    return () => {
      active = false;
    };
  }, [userId, conversationId]);
  function fresh(temp = temporary) {
    pending.current = null;
    selected.current = [];
    setMessages([]);
    setDrafts([]);
    setError("");
    setTemporary(temp);
    router.replace("/app/coach");
  }
  async function send() {
    if (busy || !text.trim() || !consent) return;
    setBusy(true);
    setRetrying(true);
    setError("");
    setStreaming("");
    setSources([]);
    abort.current = new AbortController();
    const resending = pending.current?.text === text;
    const input =
      pending.current?.text === text
        ? pending.current
        : { clientId: crypto.randomUUID(), text, conversationId };
    pending.current = input;
    setMessages((previous) =>
      resending || previous.some((m) => m.id === input.clientId)
        ? previous
        : [...previous, { id: input.clientId, role: "user", text: input.text }],
    );
    let receivedId = input.conversationId,
      finished = false;
    try {
      const response = await fetch("/api/v1/coach/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bearing-Account": userId,
        },
        body: JSON.stringify({
          ...input,
          temporary,
          consent: true,
          selected: selected.current,
          history: temporary
            ? messages
                .slice(-12)
                .map((m) => ({ role: m.role, content: m.text.slice(0, 4000) }))
            : [],
        }),
        signal: abort.current.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        if (
          response.status === 401 ||
          (response.status === 409 && data.error?.startsWith("Account changed"))
        )
          await outbox.lockAccount();
        throw new Error(data.error || "Coach is unavailable");
      }
      if (!response.body) throw new Error("No response stream");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      const event = (value: any) => {
        if (value.type === "start") receivedId = value.conversationId;
        if (value.type === "text")
          setStreaming((previous) => previous + value.text);
        if (value.type === "sources") setSources(value.sources);
        if (value.type === "done") {
          finished = true;
          const answer: Answer = value.answer;
          setMessages((previous) => [
            ...previous,
            { id: crypto.randomUUID(), role: "assistant", ...answer },
          ]);
          setDrafts((previous) => [
            ...previous.filter(
              (d) => !answer.drafts.some((next) => next.id && next.id === d.id),
            ),
            ...answer.drafts,
          ]);
          setStreaming("");
          if (answer.error) {
            setError(answer.error);
            input.conversationId = receivedId;
          } else {
            pending.current = null;
            setRetrying(false);
            selected.current = [];
            setText((previous) => (previous === input.text ? "" : previous));
          }
        }
      };
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        let split;
        while ((split = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, split);
          buffer = buffer.slice(split + 1);
          if (line.trim()) event(JSON.parse(line));
        }
      }
      if (!finished)
        throw new Error(
          "The connection ended before acknowledgement. Your message is retained; retry.",
        );
      if (receivedId && !temporary) {
        router.replace(`/app/coach?conversation=${receivedId}`);
        await reload();
      }
    } catch (e) {
      input.conversationId = receivedId;
      setError(message(e));
    } finally {
      setBusy(false);
      setStreaming("");
    }
  }
  async function saveMemory() {
    try {
      await request(userId, "coach/memory", {
        method: "PUT",
        body: JSON.stringify({ text: memoryText }),
      });
      setMemoryText("");
      await reload();
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <div className="space-y-5">
      <PageHeader
        title="Coach"
        subtitle="Find, clarify and organize your Bearing records. Changes wait for approval unless you opted in to a listed trust pattern in Settings."
        icon="Sparkles"
      />
      <SectionCard title="Model and privacy">
        <p className="text-sm">
          {config?.disclosure || "Loading model configuration…"}
        </p>
        {config && !config.configured && (
          <p role="status" className="mt-2 text-sm">
            Coach needs server setup: set BEARING_COACH_PROVIDER,
            BEARING_COACH_MODEL and the matching server API key. No credential
            is entered in this browser.
          </p>
        )}
        <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I agree to send this chat and requested excerpts to the configured
          model provider.
        </label>
      </SectionCard>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={busy} onClick={() => fresh()}>
          New conversation
        </Button>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={temporary}
            disabled={busy}
            onChange={(e) => fresh(e.target.checked)}
          />
          Temporary conversation
        </label>
        <Link
          href="/app/search"
          className="inline-flex min-h-11 items-center underline text-sm"
        >
          Search without a model
        </Link>
      </div>
      {temporary ? (
        <p role="status" className="text-sm">
          Temporary: Bearing does not save these messages or unapproved
          proposals. Provider retention follows its policy. Approved Bearing
          changes and audit receipts remain saved.
        </p>
      ) : (
        <label className="block text-sm">
          Saved conversation
          <select
            className={fieldClass}
            value={conversationId || ""}
            disabled={busy}
            onChange={(e) =>
              e.target.value
                ? router.push(`/app/coach?conversation=${e.target.value}`)
                : fresh(false)
            }
          >
            <option value="">New conversation</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {conversationId && !temporary && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            if (
              !window.confirm(
                "Delete this conversation and its pending proposals? Approved Bearing records and audit receipts remain.",
              )
            )
              return;
            try {
              await request(userId, `coach/conversations/${conversationId}`, {
                method: "DELETE",
              });
              fresh(false);
              await reload();
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          Delete conversation
        </Button>
      )}
      <section
        aria-label="Coach conversation"
        aria-live="polite"
        className="space-y-4"
      >
        {messages.map((m) => (
          <article
            key={m.id}
            className="min-w-0 rounded-xl border border-border bg-card p-4"
          >
            <p className="mb-2 text-xs font-semibold">
              {m.role === "user" ? "You" : "Coach"}
            </p>
            <div className="prose prose-sm max-w-none break-words dark:prose-invert">
              <ReactMarkdown
                components={{
                  a: ({ href, children }) =>
                    (m.sources || []).some((s) => s.href === href) ? (
                      <Link className="underline" href={href!}>
                        {children}
                      </Link>
                    ) : (
                      <span>{children}</span>
                    ),
                }}
              >
                {m.text}
              </ReactMarkdown>
            </div>
            {!!m.sources?.length && <Sources sources={m.sources} />}
            {m.role === "assistant" && !m.sources?.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                No record evidence retrieved for this response.
              </p>
            )}
            {m.clarification && (
              <div className="mt-3 space-y-2">
                <p>{m.clarification.question}</p>
                {m.clarification.candidates.map((s) => (
                  <Button
                    key={`${s.kind}:${s.id}`}
                    variant="outline"
                    className="max-w-full whitespace-normal text-left"
                    disabled={busy}
                    onClick={() => {
                      pending.current = null;
                      setRetrying(false);
                      pending.current = null;
                      setRetrying(false);
                      selected.current = [{ kind: s.kind, id: s.id }];
                      setText(
                        `I mean ${s.title}. ${m.clarification!.original}`,
                      );
                    }}
                  >
                    Choose {s.title} · {s.kind}
                  </Button>
                ))}
              </div>
            )}
            {m.error && (
              <p role="alert" className="mt-2 text-sm">
                {m.error}
              </p>
            )}
          </article>
        ))}
        {busy && (
          <article className="rounded-xl border border-border p-4">
            <p role="status">
              {streaming || "Coach is looking at the requested context…"}
            </p>
            <Sources sources={sources} />
          </article>
        )}
      </section>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="block text-sm font-medium">
          Message Coach
          <textarea
            className={`${fieldClass} min-h-28 mt-1`}
            maxLength={4000}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
          />
        </label>
        <div className="flex gap-2">
          <Button
            disabled={busy || !consent || !config?.configured || !text.trim()}
          >
            {retrying ? "Retry message" : "Send message"}
          </Button>
          {busy && (
            <Button
              type="button"
              variant="outline"
              onClick={() => abort.current?.abort()}
            >
              Stop response
            </Button>
          )}
        </div>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {drafts.map((draft, index) => (
        <ProposalCard
          key={draft.id || draft.token}
          initial={draft}
          conversationId={temporary ? undefined : conversationId}
          onChange={(next) =>
            setDrafts((previous) =>
              previous.map((d, i) => (i === index ? next : d)),
            )
          }
          onApplied={refresh}
        />
      ))}
      <SectionCard title="Remembered preferences">
        <p className="mb-3 text-sm">
          Only preferences you explicitly save here are remembered. Bearing
          records remain the factual authority. You can edit or delete these at
          any time.
        </p>
        <div className="space-y-3">
          {memories.map((memory) => (
            <Memory
              key={`${memory.id}:${memory.text}`}
              memory={memory}
              userId={userId}
              reload={reload}
            />
          ))}
          <label className="block text-sm">
            New preference
            <input
              className={fieldClass}
              maxLength={400}
              value={memoryText}
              onChange={(e) => setMemoryText(e.target.value)}
            />
          </label>
          <Button
            variant="outline"
            disabled={!memoryText.trim()}
            onClick={() => void saveMemory()}
          >
            Remember preference
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
function Sources({ sources }: { sources: Source[] }) {
  return (
    <ul aria-label="Supporting records" className="mt-3 space-y-2 text-sm">
      {sources.map((s) => (
        <li key={`${s.kind}:${s.id}`}>
          <Link className="break-words underline" href={s.href}>
            {s.title}
          </Link>{" "}
          <span className="text-xs text-muted-foreground">{s.kind}</span>
        </li>
      ))}
    </ul>
  );
}
function Memory({
  memory,
  userId,
  reload,
}: {
  memory: { id: string; text: string };
  userId: string;
  reload(): Promise<void>;
}) {
  const [text, setText] = useState(memory.text),
    [error, setError] = useState("");
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <label className="block text-sm">
        Preference
        <input
          className={fieldClass}
          value={text}
          maxLength={400}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await request(userId, "coach/memory", {
                method: "PUT",
                body: JSON.stringify({ id: memory.id, text }),
              });
              await reload();
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          Save preference
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            try {
              await request(userId, `coach/memory/${memory.id}`, {
                method: "DELETE",
              });
              await reload();
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          Forget preference
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
function RecordPreview({ value }: { value: unknown }) {
  if (value == null)
    return <p className="text-xs text-muted-foreground">No record</p>;
  return (
    <dl className="space-y-1 break-words text-xs">
      {Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !["userId", "demoBatchId"].includes(key))
        .map(([key, v]) => (
          <div key={key}>
            <dt className="font-semibold">
              {key.replaceAll(/([A-Z])/g, " $1")}
            </dt>
            <dd className="whitespace-pre-wrap">
              {v === null
                ? "None"
                : typeof v === "object"
                  ? JSON.stringify(v, null, 2)
                  : String(v)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
function ProposalCard({
  initial,
  conversationId,
  onChange,
  onApplied,
}: {
  initial: Draft;
  conversationId?: string;
  onChange(next: Draft): void;
  onApplied(): Promise<void>;
}) {
  const { userId, data } = useWorkspace();
  const [draft, setDraft] = useState(initial),
    [operations, setOperations] = useState<Operation[]>(
      initial.plan.operations,
    ),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [notice, setNotice] = useState(""),
    [result, setResult] = useState<any>(initial.result);
  function change(index: number, patch: any) {
    setOperations((previous) =>
      previous.map((op, i) => (i === index ? { ...op, ...patch } : op)),
    );
    setDirty(true);
  }
  const options = [
    ...data.items.map((i) => ({ id: i.id, title: i.title })),
    ...operations
      .filter((o) => o.op === "create_item" || o.op === "organize_moment")
      .map((o) => ({ id: (o as any).key, title: (o as any).data.title })),
  ];
  async function action(kind: "review" | "approve" | "reject") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (kind === "review") {
        const next = await request<Draft>(userId, "coach/preview", {
          method: "POST",
          body: JSON.stringify({
            operations,
            ...(draft.id ? { id: draft.id, revision: draft.revision } : {}),
            ...(conversationId ? { conversationId } : {}),
          }),
        });
        setDraft(next);
        setOperations(next.plan.operations);
        setDirty(false);
        setConfirmation("");
        onChange(next);
      } else if (kind === "approve") {
        const response = await request<any>(userId, "coach/approve", {
          method: "POST",
          body: JSON.stringify({
            token: draft.token,
            confirmation,
            approved: true,
          }),
        });
        setResult(response.value);
        setDraft((previous) => ({ ...previous, status: "applied" }));
        await onApplied();
      } else {
        await request(userId, "coach/reject", {
          method: "POST",
          body: JSON.stringify({ token: draft.token }),
        });
        setDraft((previous) => ({ ...previous, status: "rejected" }));
      }
    } catch (e) {
      setError(
        message(e) +
          (kind === "approve"
            ? " No changes were saved. If a record changed, reject this card and ask Coach for a fresh proposal from the latest record."
            : ""),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard title={`Proposed changes · ${draft.status}`}>
      <div className="space-y-4">
        {draft.status === "pending" && (
          <p className="text-sm">
            Nothing has been applied. Review every operation, edit fields if
            needed, then approve the complete batch.
          </p>
        )}
        {operations.map((op, index) => (
          <div
            key={index}
            className="space-y-3 rounded-xl border border-border p-3"
          >
            {draft.status === "pending" && operations.length > 1 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setOperations(operations.filter((_, i) => i !== index));
                  setDirty(true);
                }}
              >
                Remove operation {index + 1}
              </Button>
            )}
            <p className="text-sm font-semibold">
              {index + 1}.{" "}
              {draft.plan.previews[index]?.label || op.op.replaceAll("_", " ")}
            </p>
            {draft.status === "pending" && (
              <>
                {op.op === "create_item" ||
                op.op === "update_item" ||
                op.op === "organize_moment" ? (
                  <>
                    <label className="block text-sm">
                      Proposed type
                      <select
                        className={fieldClass}
                        value={(op.data as any).type}
                        onChange={(e) => {
                          const seed = newItemSeed(
                            e.target.value as any,
                            (op.data as any).timezone || "UTC",
                          );
                          change(index, {
                            data: {
                              ...op.data,
                              type: seed.type,
                              template: seed.template,
                              metadata: seed.metadata,
                              delegateId: null,
                              startAt: null,
                              endAt: null,
                            },
                          });
                        }}
                      >
                        {Object.entries(typeNames).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      Proposed title
                      <input
                        className={fieldClass}
                        value={(op.data as any).title || ""}
                        onChange={(e) =>
                          change(index, {
                            data: { ...op.data, title: e.target.value },
                          })
                        }
                      />
                    </label>
                    <StructuredFields
                      data={op.data}
                      change={(patch) =>
                        change(index, { data: { ...op.data, ...patch } })
                      }
                      onError={setError}
                    />
                    <label className="block text-sm">
                      Proposed content
                      <textarea
                        className={fieldClass}
                        value={(op.data as any).content || ""}
                        onChange={(e) =>
                          change(index, {
                            data: { ...op.data, content: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      Proposed status
                      <select
                        className={fieldClass}
                        value={(op.data as any).status || "inbox"}
                        onChange={(e) =>
                          change(index, {
                            data: { ...op.data, status: e.target.value },
                          })
                        }
                      >
                        {[
                          "inbox",
                          "todo",
                          "in_progress",
                          "delegated",
                          "done",
                          "archived",
                        ].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      Proposed Project
                      <select
                        className={fieldClass}
                        value={(op.data as any).projectId || ""}
                        onChange={(e) =>
                          change(index, {
                            data: {
                              ...op.data,
                              projectId: e.target.value || null,
                            },
                          })
                        }
                      >
                        <option value="">None</option>
                        {data.projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                        {operations
                          .filter((o) => o.op === "create_project")
                          .map((o) => (
                            <option key={(o as any).key} value={(o as any).key}>
                              {(o as any).data.name} (new)
                            </option>
                          ))}
                      </select>
                    </label>
                    <TagSelector
                      selected={(op.data as any).tagIds || []}
                      onChange={(tagIds) =>
                        change(index, { data: { ...op.data, tagIds } })
                      }
                    />
                  </>
                ) : null}
                {op.op === "create_project" || op.op === "update_project" ? (
                  <>
                    <label className="block text-sm">
                      Project name
                      <input
                        className={fieldClass}
                        value={op.data.name}
                        onChange={(e) =>
                          change(index, {
                            data: { ...op.data, name: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      Project description
                      <textarea
                        className={fieldClass}
                        value={op.data.description}
                        onChange={(e) =>
                          change(index, {
                            data: { ...op.data, description: e.target.value },
                          })
                        }
                      />
                    </label>
                    <TagSelector
                      selected={op.data.tagIds}
                      onChange={(tagIds) =>
                        change(index, { data: { ...op.data, tagIds } })
                      }
                    />
                  </>
                ) : null}
                {op.op === "create_tag" && (
                  <>
                    <label className="block text-sm">
                      Label name
                      <input
                        className={fieldClass}
                        value={op.data.name}
                        onChange={(e) =>
                          change(index, {
                            data: { ...op.data, name: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      Label kind
                      <select
                        className={fieldClass}
                        value={op.data.kind}
                        onChange={(e) =>
                          change(index, {
                            data: { ...op.data, kind: e.target.value },
                          })
                        }
                      >
                        <option value="tag">Tag</option>
                        <option value="area">Area</option>
                      </select>
                    </label>
                  </>
                )}
                {op.op === "link" && (
                  <>
                    <label className="block text-sm">
                      Connection relationship
                      <select
                        className={fieldClass}
                        value={op.type}
                        onChange={(e) =>
                          change(index, { type: e.target.value })
                        }
                      >
                        {[
                          "related_to",
                          "mentions",
                          "advances",
                          "tracks",
                          "scheduled_at",
                          "located_at",
                        ].map((type) => (
                          <option key={type} value={type}>
                            {type.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(["fromId", "toId"] as const).map((key) => (
                      <label key={key} className="block text-sm">
                        {key === "fromId" ? "Connect from" : "Connect to"}
                        <select
                          className={fieldClass}
                          value={op[key]}
                          onChange={(e) =>
                            change(index, { [key]: e.target.value })
                          }
                        >
                          {options.map((i) => (
                            <option value={i.id} key={i.id}>
                              {i.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </>
                )}
              </>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm">
                Full before and after
              </summary>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <h4 className="text-sm font-medium">Before</h4>
                  <RecordPreview value={draft.plan.previews[index]?.before} />
                </div>
                <div>
                  <h4 className="text-sm font-medium">After</h4>
                  <RecordPreview value={draft.plan.previews[index]?.after} />
                </div>
              </div>
            </details>
          </div>
        ))}
        {draft.status === "pending" && (
          <>
            {dirty && (
              <p role="status" className="text-sm">
                Edits need a fresh server preview before approval.
              </p>
            )}
            {draft.plan.destructive && (
              <label className="block text-sm">
                Type APPLY DESTRUCTIVE CHANGES to confirm
                <input
                  className={fieldClass}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!dirty || busy}
                onClick={() => void action("review")}
              >
                Review edited changes
              </Button>
              <Button
                disabled={
                  dirty ||
                  busy ||
                  (draft.plan.destructive &&
                    confirmation !== "APPLY DESTRUCTIVE CHANGES")
                }
                onClick={() => void action("approve")}
              >
                Approve and apply batch
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void action("reject")}
              >
                Reject proposal
              </Button>
            </div>
          </>
        )}
        {result && (
          <div role="status" className="space-y-2 text-sm">
            <p>Batch applied atomically. All views use these same records.</p>
            {result.trust && (
              <p>
                Saved under trust pattern {result.trust.patternId}, policy
                revision {result.trust.policyRevision}. Turning that pattern
                off does not undo this save.
                {result.applyReceiptId && (
                  <>
                    {" "}
                    <a
                      className="underline"
                      href={`/api/v1/coach/receipts/${result.applyReceiptId}`}
                      onClick={async (e) => {
                        e.preventDefault();
                        try {
                          const receipt = await request(
                            userId,
                            `coach/receipts/${result.applyReceiptId}`,
                          );
                          setNotice(
                            `Receipt ${receipt.id}: ${receipt.status}. Pattern ${result.trust.patternId}, policy revision ${result.trust.policyRevision}.`,
                          );
                          setError("");
                        } catch (err) {
                          setError(message(err));
                        }
                      }}
                    >
                      Batch audit receipt
                    </a>
                  </>
                )}
              </p>
            )}
            {result.changes.map((c: any, index: number) => (
              <p key={index}>
                {["item", "project"].includes(c.kind) ? (
                  <Link
                    className="underline"
                    href={`/app/${c.kind === "item" ? "library" : "projects"}/${c.id}`}
                  >
                    {c.title}
                  </Link>
                ) : (
                  <span>{c.title}</span>
                )}{" "}
                ·{" "}
                <a
                  className="underline"
                  href={`/api/v1/coach/receipts/${c.receiptId}`}
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      const receipt = await request(
                        userId,
                        `coach/receipts/${c.receiptId}`,
                      );
                      setNotice(`Receipt ${receipt.id}: ${receipt.status}`);
                      setError("");
                    } catch (err) {
                      setError(message(err));
                    }
                  }}
                >
                  Audit receipt
                </a>
              </p>
            ))}
          </div>
        )}
        {notice && (
          <p role="status" className="text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
