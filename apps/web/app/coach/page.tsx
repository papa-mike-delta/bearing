import { requireUser } from "../../auth";
import { coachCloseDay, coachThread, threadMessages } from "../../lib/coach-threads";
import { isJournalDay } from "../../lib/journal-day";
import { Header } from "../header";
import { Chat } from "./chat";

export default async function Coach({ searchParams }: { searchParams: Promise<{ closeDay?: string }> }) {
  const user = await requireUser();
  const threadId = await coachThread(user.id);
  const messages = await threadMessages(user.id, threadId);
  const { closeDay: requested } = await searchParams;
  const closeDay = isJournalDay(requested) ? requested : await coachCloseDay(user.id, threadId);

  return (
    <>
      <Header email={user.email} />
      <main>
        <Chat
          key={`${messages?.at(-1)?.id ?? "empty"}:${closeDay ?? "coach"}`}
          threadId={threadId}
          initialMessages={messages ?? []}
          initialCloseDay={closeDay}
          openingClose={isJournalDay(requested)}
        />
      </main>
    </>
  );
}
