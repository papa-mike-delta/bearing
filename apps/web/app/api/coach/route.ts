import { createUIMessageStreamResponse } from "ai";
import { after } from "next/server";
import { getApiUser } from "../../../auth";
import { coachModel, coachTurn } from "../../../lib/coach-turn";

// Body: { threadId, message }, the newest message only. The thread's earlier
// messages come from the database.
export async function POST(request: Request) {
  const user = await getApiUser();
  if (!user) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null);
  const turn = await coachTurn({
    userId: user.id,
    threadId: body?.threadId,
    message: body?.message,
    today: typeof body?.today === "string" ? body.today : "",
    model: coachModel(),
  });
  if ("refused" in turn) return new Response(null, { status: turn.refused });
  after(turn.saved);
  return createUIMessageStreamResponse({ stream: turn.stream });
}
