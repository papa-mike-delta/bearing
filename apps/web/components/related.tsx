"use client";

import Link from "next/link";
import { useEffect, useState, useTransition, type KeyboardEvent } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import type {
  LinkEnd,
  LinkKind,
  PickerHit,
  RelatedItem,
  RelatedLists,
} from "@repo/domain";
import { localToday } from "../lib/today";
import {
  createLink,
  deleteLink,
  findLinkTargets,
} from "../app/related-actions";

const kindLabel: Record<LinkKind, string> = {
  task: "Task",
  note: "Note",
  journal: "Journal",
};

function Item({
  item,
  direction,
  pending,
  onRemove,
}: {
  item: RelatedItem;
  direction: "outgoing" | "incoming";
  pending: boolean;
  onRemove: (edgeId: string) => void;
}) {
  return (
    <li className="card-row">
      <Link href={item.href}>{item.label}</Link>
      <span>{kindLabel[item.kind]}</span>
      {item.detail ? <span>{item.detail}</span> : null}
      {item.completed ? <span>Completed</span> : null}
      <span className="sr-only">
        {direction === "outgoing" ? "Outgoing" : "Backlink"}
      </span>
      {direction === "outgoing" ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Remove this link?")) return;
            onRemove(item.edgeId);
          }}
        >
          Remove link
        </Button>
      ) : null}
    </li>
  );
}

export function Related({
  source,
  initial,
}: {
  source: LinkEnd;
  initial: RelatedLists;
}) {
  const [lists, setLists] = useState(initial);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PickerHit[]>([]);
  const [more, setMore] = useState(false);
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    setLists(initial);
  }, [initial]);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    const handle = setTimeout(() => {
      void findLinkTargets(query, 0, localToday(), source.kind, source.id).then(
        (page) => {
          if (cancel) return;
          setHits(page.hits);
          setMore(page.more);
          setActive(0);
        },
      );
    }, 150);
    return () => {
      cancel = true;
      clearTimeout(handle);
    };
  }, [open, query, source.kind, source.id]);

  function choose(hit: PickerHit) {
    setError("");
    setNotice("");
    start(async () => {
      const result = await createLink(
        source.kind,
        source.id,
        hit.kind,
        hit.id,
        localToday(),
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setLists(result.related);
      setNotice(result.exists ? "That link already exists." : "");
      setOpen(false);
      setQuery("");
    });
  }

  function remove(edgeId: string) {
    setError("");
    setNotice("");
    start(async () => {
      const result = await deleteLink(edgeId, source.kind, source.id);
      if ("error" in result) setError(result.error);
      else setLists(result.related);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(hits.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && hits[active]) {
      event.preventDefault();
      choose(hits[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <section aria-label="Related" className="mt-8">
      <h2>Related</h2>
      <h3>Outgoing</h3>
      {lists.outgoing.length === 0 ? (
        <p>No outgoing links.</p>
      ) : (
        <ul>
          {lists.outgoing.map((item) => (
            <Item
              key={item.edgeId}
              item={item}
              direction="outgoing"
              pending={pending}
              onRemove={remove}
            />
          ))}
        </ul>
      )}
      <h3>Backlinks</h3>
      {lists.incoming.length === 0 ? (
        <p>No backlinks.</p>
      ) : (
        <ul>
          {lists.incoming.map((item) => (
            <Item
              key={item.edgeId}
              item={item}
              direction="incoming"
              pending={pending}
              onRemove={remove}
            />
          ))}
        </ul>
      )}
      {open ? (
        <div>
          <label
            className="sr-only"
            htmlFor={`add-link-${source.kind}-${source.id}`}
          >
            Find a task, note, or journal day
          </label>
          <Input
            id={`add-link-${source.kind}-${source.id}`}
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls={`link-hits-${source.id}`}
            aria-activedescendant={
              hits[active]
                ? `link-hit-${hits[active].kind}-${hits[active].id}`
                : undefined
            }
            value={query}
            placeholder="Task name, note title, or date"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
          />
          <ul id={`link-hits-${source.id}`} role="listbox">
            {hits.map((hit, index) => (
              <li
                key={`${hit.kind}:${hit.id}`}
                id={`link-hit-${hit.kind}-${hit.id}`}
                role="option"
                aria-selected={index === active}
              >
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => choose(hit)}
                >
                  {kindLabel[hit.kind]}: {hit.label}
                  {hit.detail ? ` · ${hit.detail}` : ""}
                  {hit.completed ? " · Completed" : ""}
                </button>
              </li>
            ))}
          </ul>
          {more ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                void findLinkTargets(
                  query,
                  hits.length,
                  localToday(),
                  source.kind,
                  source.id,
                ).then((page) => {
                  setHits((current) => {
                    const seen = new Set(
                      current.map((hit) => `${hit.kind}:${hit.id}`),
                    );
                    return [
                      ...current,
                      ...page.hits.filter(
                        (hit) => !seen.has(`${hit.kind}:${hit.id}`),
                      ),
                    ];
                  });
                  setMore(page.more);
                });
              }}
            >
              More
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(true);
            setNotice("");
            setError("");
          }}
        >
          Add link
        </Button>
      )}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
