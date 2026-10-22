"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  dayWords,
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
    [error, setError] = useState(""),
    [added, setAdded] = useState<{ name: string; group: string; seq: number } | null>(null),
    [inFlight, setInFlight] = useState(0);
  const router = useRouter();
  const nameField = useRef<HTMLInputElement>(null);
  // Quick add: each submit takes the typed name and clears the field at once,
  // so the next person can be typed while the last one saves. The board stays
  // on /people and refreshes; nothing is disabled or navigated away mid-row.
  async function submit() {
    const person = { name, group };
    setName("");
    setError("");
    setInFlight((n) => n + 1);
    try {
      const result = await addPerson(person);
      if ("error" in result) {
        setError(result.error);
        setName((current) => current || person.name);
      } else {
        window.dispatchEvent(new Event("people-changed"));
        setAdded((last) => ({ ...person, seq: (last?.seq ?? 0) + 1 }));
        router.refresh();
      }
    } catch {
      setError(`Could not add '${person.name}'. Please try again.`);
      setName((current) => current || person.name);
    } finally {
      setInFlight((n) => n - 1);
      nameField.current?.focus();
    }
  }
  return (
    <>
      <form
        className="panel people-form flex flex-col items-stretch gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) void submit();
        }}
      >
        <label className="field">
          Name
          <Input
            ref={nameField}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label className="field">
          Group
          <select
            aria-label="Group"
            name="group"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            required
          >
            <option value="" disabled>
              Choose a group
            </option>
            {peopleGroups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <Button type="submit" className="w-full">
          Add person
        </Button>
        <p role="status" className="text-sm">
          {inFlight ? "Adding…" : added ? `Added '${added.name}' to ${added.group}` : ""}
        </p>
        {error && <p role="alert">{error}</p>}
      </form>
      {today === null ? (
        <p role="status">Loading today…</p>
      ) : (
        <PeopleGroups key={today} people={people} today={today} added={added} />
      )}
    </>
  );
}
function PeopleGroups({
  people,
  today,
  added,
}: {
  people: (PersonFields & { id: string })[];
  today: string;
  added: { group: string; seq: number } | null;
}) {
  const groups = groupPeople(people, today);
  // Mount afresh on a visit: no persisted accordion preference, multiple open.
  const [open, setOpen] = useState(
    () => new Set(groups.filter((g) => g.open).map((g) => g.group)),
  );
  // A quick add opens its group so the new person is visible.
  useEffect(() => {
    if (added) setOpen((current) => new Set(current).add(added.group as never));
  }, [added]);
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
                    {(() => {
                      const day = personNextReachOut(p);
                      return day ? dayWords(day, today) : "No reach-out day";
                    })()}
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
