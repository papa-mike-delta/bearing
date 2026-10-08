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
};

// What a tool's handler runs with: the session user, the model's tool-call id
// and the data.
export type ToolRunContext = {
  userId: string;
  toolCallId: string;
  data: CoachData;
};
