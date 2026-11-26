"use client";

import { useEffect } from "react";

/** Refresh the V1 editor lease for this account. No legacy open-item route. */
export function useOpenItem(id: string | null | undefined, account?: string) {
  useEffect(() => {
    if (!id || !account) return;
    const url = `/api/v1/items/${encodeURIComponent(id)}/lease`;
    const token = crypto.randomUUID();
    const send = (open: boolean) =>
      fetch(url, {
        method: "POST",
        body: JSON.stringify({ token, open }),
        headers: {
          "Content-Type": "application/json",
          "X-Bearing-Account": account,
        },
        keepalive: true,
      }).then(
        () => {},
        () => {},
      );
    let pending = send(true);
    const timer = setInterval(() => {
      pending = pending.then(() => send(true));
    }, 30_000);
    return () => {
      clearInterval(timer);
      void pending.then(() => send(false));
    };
  }, [id, account]);
}
