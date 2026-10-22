"use client";

import Link from "next/link";
import { PeopleCount } from "./people/people-count";
import { useCallback, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useBrowserToday } from "./browser-today";
import { unfinishedHabits } from "./habits/actions";

const links: { href: string; label: string; count?: boolean }[] = [
  { href: "/", label: "Tasks" },
  { href: "/inbox", label: "Inbox" },
  { href: "/notes", label: "Notes" },
  { href: "/journal", label: "Journal" },
  { href: "/habits", label: "Habits", count: true },
  { href: "/people", label: "People" },
  { href: "/coach", label: "Coach" },
  { href: "/account", label: "Account" },
];

const counts = new Map<string, number>();
const serverCount = () => null;

function readHabitCount(today: string | null) {
  if (!today || !counts.has(today)) return null;
  return counts.get(today)!;
}

function subscribeHabitCount(today: string, onChange: () => void) {
  let live = true;
  const load = () => {
    unfinishedHabits(today).then((result) => {
      if (!live || !("count" in result)) return;
      counts.set(today, result.count);
      onChange();
    }).catch(() => {});
  };
  load();
  window.addEventListener("habits-changed", load);
  return () => {
    live = false;
    window.removeEventListener("habits-changed", load);
  };
}

function HabitCount() {
  const today = useBrowserToday();
  const subscribe = useCallback(
    (onChange: () => void) => (today ? subscribeHabitCount(today, onChange) : () => {}),
    [today],
  );
  const getSnapshot = useCallback(() => readHabitCount(today), [today]);
  const count = useSyncExternalStore(subscribe, getSnapshot, serverCount);
  if (count === null) return null;
  return <span className="habit-count">{count}<span className="sr-only"> not done today</span></span>;
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="app-nav">
      {links.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
            {link.count ? <HabitCount /> : link.href === "/people" ? <PeopleCount /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
