"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  groupPeople,
  peopleGroups,
  personIsDue,
  personNextReachOut,
  type PersonFields,
} from "@repo/domain";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { useBrowserToday } from "../browser-today";
import { addPerson } from "./actions";
export function PeopleBoard({
  people,
}: {
  people: (PersonFields & { id: string })[];
}) {
  const today = useBrowserToday();
  const [name, setName] = useState(""),
    [group, setGroup] = useState(""),
    [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <form
        className="panel flex flex-wrap gap-3 items-end"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => {
            try {
              const result = await addPerson({ name, group });
              if ("error" in result) setError(result.error);
              else {
                window.dispatchEvent(new Event("people-changed"));
                router.push(result.href);
              }
            } catch {
              setError("Could not add this person. Please try again.");
            }
          });
        }}
      >
        <label>
          Name
          <Input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            disabled={pending}
          />
        </label>
        <label>
          Group
          <select
            aria-label="Group"
            name="group"
            className="border rounded p-2 block"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            required
            disabled={pending}
          >
            <option value="" disabled>
              Choose a group
            </option>
            {peopleGroups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={pending}>
          Add person
        </Button>
        {error && <p role="alert">{error}</p>}
      </form>
      {today === null ? (
        <p role="status">Loading today…</p>
      ) : (
        <PeopleGroups key={today} people={people} today={today} />
      )}
    </>
  );
}
function PeopleGroups({
  people,
  today,
}: {
  people: (PersonFields & { id: string })[];
  today: string;
}) {
  const groups = groupPeople(people, today);
  // Mount afresh on a visit: no persisted accordion preference, multiple open.
  const [open, setOpen] = useState(
    () => new Set(groups.filter((g) => g.open).map((g) => g.group)),
  );
  if (!groups.length)
    return (
      <p className="empty-state">
        No people yet. Add someone to keep in touch.
      </p>
    );
  return (
    <div className="flex flex-col gap-4 mt-6">
      {groups.map((g) => (
        <section key={g.group} className="panel">
          <h2>
            <button
              type="button"
              className="w-full text-left"
              aria-expanded={open.has(g.group)}
              aria-controls={`group-${peopleGroups.indexOf(g.group)}`}
              onClick={() =>
                setOpen((current) => {
                  const next = new Set(current);
                  if (next.has(g.group)) next.delete(g.group);
                  else next.add(g.group);
                  return next;
                })
              }
            >
              {g.group} ({g.people.length})
            </button>
          </h2>
          <ul
            id={`group-${peopleGroups.indexOf(g.group)}`}
            hidden={!open.has(g.group)}
          >
            {g.people.map((p) => (
              <li key={p.id}>
                <Link
                  className="flex justify-between gap-4 py-2"
                  href={`/people/${p.id}`}
                >
                  <span>{p.name}</span>
                  <span>
                    {personIsDue(p, today) ? "Due · " : ""}
                    {personNextReachOut(p) ?? "No reach-out day"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
