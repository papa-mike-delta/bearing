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
import { useRelatedPicker } from "../lib/use-related-picker";
import { createLink, deleteLink } from "../app/related-actions";

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
  const meta = [
    kindLabel[item.kind],
    item.detail,
    item.completed ? "Completed" : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return (
    <li className="related-item">
      <div className="related-main">
        <Link className="related-title" href={item.href}>
          {item.label}
        </Link>
        <p className="related-meta">{meta}</p>
        <span className="sr-only">
          {direction === "outgoing" ? "Outgoing" : "Backlink"}
        </span>
      </div>
      {direction === "outgoing" ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="related-remove"
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
  const { open, query, hits, more, active, dispatch } =
    useRelatedPicker(source);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    setLists(initial);
  }, [initial]);

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
      dispatch({ type: "reset" });
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
      dispatch({ type: "move", direction: 1 });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      dispatch({ type: "move", direction: -1 });
    } else if (event.key === "Enter" && hits[active]) {
      event.preventDefault();
      choose(hits[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      dispatch({ type: "cancel" });
    }
  }

  const picker = open ? (
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
        onChange={(event) =>
          dispatch({ type: "query", value: event.target.value })
        }
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
          onClick={() => dispatch({ type: "more" })}
        >
          More
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => dispatch({ type: "cancel" })}
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
        dispatch({ type: "open" });
        setNotice("");
        setError("");
      }}
    >
      Add link
    </Button>
  );

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
      {picker}
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
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
