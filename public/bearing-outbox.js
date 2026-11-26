/** Shared by the online app and its static offline shell. No cookies or API responses are cached. */
const DATABASE = "bearing-capture-v1";
export const channelName = "bearing-capture-events";
function announce(type, userId) {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({ type, userId });
    channel.close();
  }
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent(channelName, { detail: { type, userId } }),
    );
}
function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const entries = db.createObjectStore("entries", {
        keyPath: ["userId", "clientId"],
      });
      entries.createIndex("owner", "userId");
      db.createObjectStore("meta");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function run(name, mode, action) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode);
    let value;
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        tx.error ||
          new Error("Local storage failed; your text has not been saved"),
      );
    };
    action(tx.objectStore(name), (result) => {
      value = result;
    });
  });
}
export async function activeAccount() {
  return run("meta", "readonly", (store, done) => {
    store.get("active").onsuccess = (e) => done(e.target.result ?? null);
  });
}
export async function activateAccount(identity) {
  if (
    !identity?.userId ||
    !identity?.email ||
    !Number.isFinite(identity.expiresAt) ||
    identity.expiresAt <= Date.now()
  )
    throw new Error("Confirm your signed-in account online");
  await run("meta", "readwrite", (store) => store.put(identity, "active"));
  announce("account", identity.userId);
}
export async function lockAccount() {
  await run("meta", "readwrite", (store) => store.delete("active"));
  announce("locked", null);
}
export async function listEntries(userId) {
  return run("entries", "readonly", (store, done) => {
    store.index("owner").getAll(IDBKeyRange.only(userId)).onsuccess = (e) =>
      done(
        e.target.result.sort((a, b) =>
          a.capturedAt.localeCompare(b.capturedAt),
        ),
      );
  });
}
export async function enqueue(userId, capture) {
  const active = await activeAccount();
  if (!active || active.userId !== userId || active.expiresAt <= Date.now())
    throw new Error("Sign in online before capturing for this account");
  const entry = {
    ...capture,
    userId,
    status: "pending",
    attempts: 0,
    error: null,
  };
  await run("entries", "readwrite", (store) => {
    const request = store.add(entry);
    request.onerror = () => {};
  });
  announce("entries", userId);
  return entry;
}
async function update(userId, clientId, patch) {
  await run("entries", "readwrite", (store) => {
    store.get([userId, clientId]).onsuccess = (e) => {
      const row = e.target.result;
      if (row && !(row.status === "synced" && patch.status !== "synced"))
        store.put({ ...row, ...patch });
    };
  });
  announce("entries", userId);
}
export async function syncOutbox(userId, options = {}) {
  const fetcher = options.fetcher || globalThis.fetch;
  async function sync() {
    const active = await activeAccount();
    if (!active || active.userId !== userId || active.expiresAt <= Date.now())
      return { synced: 0, locked: true };
    let identity;
    try {
      const response = await fetcher("/api/v1/identity", {
        cache: "no-store",
        headers: { "X-Bearing-Account": userId },
      });
      if (response.status === 401 || response.status === 409) {
        await lockAccount();
        return { synced: 0, locked: true };
      }
      if (!response.ok) return { synced: 0, unavailable: true };
      identity = await response.json();
    } catch {
      return { synced: 0, offline: true };
    }
    if (identity.userId !== userId) {
      await lockAccount();
      return { synced: 0, locked: true };
    }
    let synced = 0;
    for (const entry of await listEntries(userId)) {
      if (
        entry.status === "synced" ||
        (entry.status === "error" && !options.retryErrors)
      )
        continue;
      const current = await activeAccount();
      if (current?.userId !== userId || current.expiresAt <= Date.now())
        return { synced, locked: true };
      const { clientId, text, capturedAt, occurredAt, timezone, intendedType } =
        entry;
      try {
        const response = await fetcher("/api/v1/capture", {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-Bearing-Account": userId,
          },
          body: JSON.stringify({
            clientId,
            text,
            capturedAt,
            occurredAt,
            timezone,
            ...(intendedType ? { intendedType } : {}),
            ...(entry.place ? { place: entry.place } : {}),
            ...(entry.mentionIds ? { mentionIds: entry.mentionIds } : {}),
          }),
        });
        if (
          response.status === 401 ||
          (response.status === 409 &&
            (await response.clone().json()).error?.startsWith(
              "Account changed",
            ))
        ) {
          await lockAccount();
          return { synced, locked: true };
        }
        const result = await response.json();
        if (!response.ok) {
          await update(userId, clientId, {
            status: "error",
            error: result.error || "Could not sync. Your capture is retained.",
            attempts: entry.attempts + 1,
          });
          continue;
        }
        if (!result.ok || typeof result.value?.id !== "string")
          throw new Error("Missing server acknowledgment");
        await update(userId, clientId, {
          status: "synced",
          serverId: result.value.id,
          error: null,
          attempts: entry.attempts + 1,
        });
        synced++;
      } catch {
        await update(userId, clientId, {
          status: "pending",
          error: "Waiting for a connection or server acknowledgment",
          attempts: entry.attempts + 1,
        });
        return { synced, offline: true };
      }
    }
    return { synced };
  }
  if (globalThis.navigator?.locks)
    return navigator.locks.request(
      `bearing-sync:${userId}`,
      { ifAvailable: true },
      (lock) => (lock ? sync() : { synced: 0, busy: true }),
    );
  return sync(); // The server's immutable client key also makes concurrent retries safe.
}
export function formatLocalTime(value, timezone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function localTimeToInstant(value, timezone) {
  const desired = Date.parse(value + ":00Z");
  if (!Number.isFinite(desired))
    throw new Error("Choose a valid date and time");
  const offsets = new Set();
  for (let h = -36; h <= 36; h += 6) {
    const at = desired + h * 3600000;
    offsets.add(Date.parse(formatLocalTime(at, timezone) + ":00Z") - at);
  }
  const matches = [...offsets]
    .map((offset) => new Date(desired - offset))
    .filter((at) => formatLocalTime(at, timezone) === value)
    .sort((a, b) => +a - +b);
  if (!matches.length)
    throw new Error(
      "That local time does not exist during the clock change. Choose another time.",
    );
  return matches[0].toISOString();
}
