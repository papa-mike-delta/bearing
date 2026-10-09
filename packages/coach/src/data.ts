// What the Coach's tools need from Bearing's data, injected by the web app so
// this package needs no database, no AI SDK and no key. Every call takes the
// session user's id; a tool never gets a user id from the model.

export type ListedTask = {
  id: string;
  name: string;
  priority: number;
  isNext: boolean;
};

export type CoachData = {
  // The user's open Tasks in Priority List order, the Next one marked.
  listOpenTasks(userId: string): Promise<ListedTask[]>;
  // Null when the name or note is refused. `sourceId` is resend-safe (message
  // id + a hash of the name), so a retry of the same add is the same Task.
  createTask(
    userId: string,
    input: { name: string; note?: string },
    from: { source: "coach"; sourceId: string },
  ): Promise<{ id: string; name: string } | null>;
  // Null when that id is not an open Task of this user.
  completeTask(
    userId: string,
    taskId: string,
  ): Promise<{ id: string; name: string } | null>;
};

// What a tool's handler runs with: the session user, the model's tool-call id,
// the person's message id (stable across resends), and the data.
export type ToolRunContext = {
  userId: string;
  toolCallId: string;
  messageId: string;
  data: CoachData;
};
