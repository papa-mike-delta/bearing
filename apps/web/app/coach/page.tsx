import { requireUser } from "../../auth";
import { coachThread, threadMessages } from "../../lib/coach-threads";
import { Header } from "../header";
import { Chat } from "./chat";

export default async function Coach() {
  const user = await requireUser();
  const threadId = await coachThread(user.id);
  const messages = await threadMessages(user.id, threadId);

  return (
    <>
      <Header email={user.email} />
      <main>
        <Chat
          key={messages?.at(-1)?.id ?? "empty"}
          threadId={threadId}
          initialMessages={messages ?? []}
        />
      </main>
    </>
  );
}
