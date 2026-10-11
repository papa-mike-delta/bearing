"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBrowserToday } from "../browser-today";

export function OpenToday() {
  const today = useBrowserToday();
  const router = useRouter();
  useEffect(() => {
    if (today) router.replace(`/journal/${today}`);
  }, [today, router]);
  return <p role="status">Opening today…</p>;
}
