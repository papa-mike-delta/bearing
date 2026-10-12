"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { mondayOf } from "@repo/domain";
import { useBrowserToday } from "../browser-today";

export function OpenWeek() {
  const today = useBrowserToday();
  const router = useRouter();
  useEffect(() => {
    if (!today) return;
    const week = mondayOf(today);
    if (week) router.replace(`/habits?today=${today}&week=${week}`);
  }, [today, router]);
  return <p role="status">Opening this week…</p>;
}
