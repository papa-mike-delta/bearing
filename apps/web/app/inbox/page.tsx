import { Button } from "@repo/ui/components/button";
import { Textarea } from "@repo/ui/components/textarea";
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
        <Textarea
          name="body"
          aria-label="Capture"
          rows={4}
          // The kit field does not resize. A capture stays resizable, as it was.
          className="field-sizing-fixed resize"
          maxLength={maxDraftLength}
          required
        />
        {error && Object.hasOwn(errors, error) ? (
          <p role="alert">{errors[error]}</p>
        ) : null}
        <Button type="submit">Capture</Button>
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
                <Button type="submit" variant="outline">
                  File as task
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
