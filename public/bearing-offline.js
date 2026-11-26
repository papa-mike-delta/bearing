import {
  activeAccount,
  listEntries,
  enqueue,
  syncOutbox,
  lockAccount,
  channelName,
  formatLocalTime,
  localTimeToInstant,
} from "/bearing-outbox.js";
const $ = (id) => document.getElementById(id);
let account = null,
  busy = false,
  resync = false,
  retryAgain = false;
let zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const date = (at, timeZone = zone) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
function localInput(at) {
  return formatLocalTime(at, zone);
}
function locked() {
  account = null;
  $("workspace").hidden = true;
  $("locked").hidden = false;
  $("entries").replaceChildren();
  $("status").textContent = "Sign-in required";
}
async function render() {
  if (!account) return;
  const current = await activeAccount();
  if (current?.userId !== account.userId || current.expiresAt <= Date.now()) {
    locked();
    return;
  }
  const rows = (await listEntries(account.userId)).filter(
    (row) => date(row.occurredAt, row.timezone) === $("date").value,
  );
  $("entries").replaceChildren();
  for (const row of rows) {
    const article = document.createElement("article"),
      label = document.createElement("strong"),
      text = document.createElement("p");
    label.textContent = `${new Date(row.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${row.status === "synced" ? "Synced" : row.status === "error" ? "Needs attention" : "Pending sync"}`;
    text.textContent = row.text;
    article.append(label, text);
    if (row.error) {
      const error = document.createElement("p");
      error.textContent = row.error;
      article.append(error);
    }
    $("entries").append(article);
  }
  if (!rows.length)
    $("entries").textContent = "No captures on this device for this date.";
}
async function sync(retryErrors = false) {
  if (!account) return;
  if (busy) {
    resync = true;
    retryAgain ||= retryErrors;
    return;
  }
  busy = true;
  try {
    const result = await syncOutbox(account.userId, { retryErrors });
    if (result.locked) locked();
    else {
      $("status").textContent = result.offline
        ? "Offline · your text stays on this device"
        : result.unavailable
          ? "Server unavailable · your text is retained"
          : "Connected · captured text is saved to your account";
      await render();
    }
  } finally {
    busy = false;
    if (resync && account) {
      const retry = retryAgain;
      resync = false;
      retryAgain = false;
      queueMicrotask(() => sync(retry));
    }
  }
}
async function start() {
  const saved = await activeAccount();
  if (!saved || saved.expiresAt <= Date.now()) {
    locked();
    return;
  }
  if (navigator.onLine) {
    try {
      const response = await fetch("/api/v1/identity", {
        cache: "no-store",
        headers: { "X-Bearing-Account": saved.userId },
      });
      if (
        response.status === 401 ||
        response.status === 409 ||
        (response.ok && (await response.json()).userId !== saved.userId)
      ) {
        await lockAccount();
        locked();
        return;
      }
    } catch {
      /* Prior authenticated context permits local capture, never server reads. */
    }
  }
  account = saved;
  zone = saved.timezone || zone;
  $("locked").hidden = true;
  $("workspace").hidden = false;
  $("account").textContent = `Capturing for ${saved.email}`;
  $("date").value =
    new URL(location.href).searchParams.get("date") || date(new Date());
  $("occurred").value = localInput(new Date());
  $("status").textContent =
    "Offline-ready · captures remain on this device until saved to your account";
  await render();
  await sync();
}
$("capture").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("text").value;
  if (!text.trim() || !account) return;
  try {
    const capturedAt = new Date().toISOString(),
      occurredAt = localTimeToInstant($("occurred").value, zone);
    await enqueue(account.userId, {
      clientId: crypto.randomUUID(),
      text,
      capturedAt,
      occurredAt,
      timezone: zone,
    });
    $("text").value = "";
    $("date").value = date(occurredAt);
    await render();
    await sync();
  } catch (error) {
    $("status").textContent = error.message;
  }
});
$("date").addEventListener("change", render);
$("retry").addEventListener("click", () => sync(true));
$("lock").addEventListener("click", async () => {
  await lockAccount();
  locked();
});
window.addEventListener("online", () => sync());
if (typeof BroadcastChannel !== "undefined") {
  const channel = new BroadcastChannel(channelName);
  channel.onmessage = async () => {
    const current = await activeAccount();
    if (!account || current?.userId !== account.userId) locked();
    else await render();
  };
}
start().catch((error) => {
  $("status").textContent =
    `Device storage unavailable: ${error.message}. Your text has not been saved.`;
});

setInterval(() => {
  if (navigator.onLine) void sync();
}, 30_000);
