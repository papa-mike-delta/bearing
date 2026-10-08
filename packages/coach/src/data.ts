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
  // Null when the name or note is refused. `sourceId` is the tool-call id, so
  // a retry of the same call is the same add.
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

// What a tool's handler runs with: the session user, the model's tool-call id
// and the data.
export type ToolRunContext = {
  userId: string;
  toolCallId: string;
  data: CoachData;
};
