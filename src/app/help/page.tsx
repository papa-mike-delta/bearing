import Link from "next/link";
export const metadata = { title: "Help and privacy" };
const sections = [
  [
    "Getting started",
    "Sign in with your own account. Registration requires an email-bound, expiring invitation from the operator. New accounts start with one Me profile and no examples. In Settings, choose Add demo data to populate only your account. Repeating setup reports that examples are already ready. Remove demo data removes unedited examples; if you edited them or added personal references, resolve those references first. A setup failure never means examples are ready; retry the explicit action after resolving the reported error.",
  ],
  [
    "Capture and organize",
    "Quick Capture saves raw text to Inbox or the Daily Journal. You can organize a moment into an Item while preserving the original text. For a saved Task with a scheduled start, use Task recurrence to enable a fixed calendar or completion-based interval in its timezone. Completion preserves the original and creates one successor; history links remain visible. Task checklists are Markdown checkboxes; promoting a step creates a real Task. A Routine is a Habit with a checklist: checking a step is different from completing the Habit. Projects are optional, Areas are enduring responsibilities and Tags are topics. Project Areas are displayed as inherited rather than copied.",
  ],
  [
    "People, Places and daily life",
    "Me is your canonical Person profile. Link private reference Notes to Me. A Journal mention is not an interaction; record interactions explicitly. Place Bookmarks can store coordinates from a permission-based GPS action and open external Maps. File Bookmarks point to external files; Bearing does not host uploads. Mood check-ins can repeat during a day; Reviews are separate reflections. Focus sessions are Activity with retry protection.",
  ],
  [
    "Offline capture",
    "After a prior authenticated visit, the installed or cached app can open a minimal Journal/Quick Capture shell offline. Text is queued in per-account IndexedDB, with local capture time and a stable key. Reconnection syncs automatically; errors stay available for retry. Do not clear browser storage while entries are pending. Logout locks the queue; the same account must sign in to resume. Offline capture is not full Item editing, AI chat or a complete offline database. Browser storage can be evicted. Sync and export regularly.",
  ],
  [
    "Coach and privacy",
    "Coach needs an operator-configured OpenRouter or Vercel AI Gateway provider and model. Before chat, you see provider disclosure and choose whether to continue. Your message, bounded recent history, explicitly saved preferences and selected excerpts of owned records may leave this server for that provider. Its retention policy applies. Structured records and receipts are authoritative: inspect source links. Coach has no external research tools. Proposed writes require your explicit approval unless you opted in, in Settings, to one of the listed trust patterns. Each pattern allows one fresh Coach operation of that exact effect. Edited proposals, older pending cards, and every other change still wait. Destructive proposals require extra confirmation. Restoring a backup turns trust off until you opt in again. Saved conversations persist by default; temporary mode does not save chat content. Rate counters and approved-write audit remain. Memory is saved only explicitly and can be inspected, edited and deleted.",
  ],
  [
    "Export, clear and restore",
    "In Settings, export a V1 JSON backup and keep it private. It covers Items, Me content, Projects, Tags/Areas, relationships, Activity, Journal, Reviews, recurrence histories, saved Coach conversations/proposals/preferences and account audit receipts. Passwords, 2FA secrets, invitations, editor leases, local drafts, offline queues and legacy data are excluded. Restore is only to the same account and replaces V1 records after server validation. Other preferences return. Coach trust patterns in the backup stay off until you opt in again. Type RESTORE V1 DATA to enable restore. Type RESET V1 DATA to clear V1 content; identity, Me identity and audit remain. Sync pending captures and close other editors first. Existing receipts are append-only. A refused restore leaves existing data intact.",
  ],
  [
    "Troubleshooting",
    "If sign-in fails, check your account credentials or contact the operator for an invitation; no automatic seed runs after failure. If setup fails, normal sign-in remains available. A record conflict keeps your draft: reload the latest record and reconcile. Offline errors remain in the outbox until acknowledged. If Coach is unavailable, ask the operator to check server-side model configuration. Never put provider keys in browser settings or publish a backup. QR sign-in requires verified same-account confirmation and an unexpired challenge; the current in-memory challenge transport is not reliable across multiple server workers.",
  ],
];
export default function Help() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <Link href="/app" className="inline-flex min-h-11 items-center underline">
        Open app
      </Link>
      <h1 className="text-4xl font-bold">Help and privacy</h1>
      {sections.map(([title, text]) => (
        <section key={title}>
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="mt-3 leading-7 text-muted-foreground">{text}</p>
        </section>
      ))}
      <Link href="/" className="inline-flex min-h-11 items-center underline">
        About Bearing
      </Link>
    </main>
  );
}
