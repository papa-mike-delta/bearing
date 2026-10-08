import { maxDraftLength, maxTaskNameLength } from "@repo/domain";
import { requireUser } from "../../auth";
import { inboxDrafts } from "../../lib/drafts";
import { captureToInbox, fileDraft } from "../actions";
import { Header } from "../header";

const errors: Record<string, string> = {
  empty: "Nothing to capture.",
  "too-long": `Too long. A Draft can be up to ${maxDraftLength.toLocaleString("en-US")} characters.`,
  "cannot-file": `Couldn't file that Draft. Its first line becomes the task name, which must be ${maxTaskNameLength} characters or fewer.`,
};

export default async function Inbox({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const [drafts, { error }] = await Promise.all([
    inboxDrafts(user.id),
    searchParams,
  ]);

  return (
    <main>
      <Header email={user.email} />
      <form action={captureToInbox}>
        <textarea
          name="body"
          aria-label="Capture"
          rows={4}
          maxLength={maxDraftLength}
          required
        />
        {error && Object.hasOwn(errors, error) ? (
          <p role="alert">{errors[error]}</p>
        ) : null}
        <button type="submit">Capture</button>
      </form>
      {drafts.length === 0 ? (
        <p>Inbox is empty.</p>
      ) : (
        <ul>
          {drafts.map((draft) => (
            <li key={draft.id}>
              <span>{draft.body}</span>
              <form action={fileDraft}>
                <input type="hidden" name="id" value={draft.id} />
                <button type="submit">File as task</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
