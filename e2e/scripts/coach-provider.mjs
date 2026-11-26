// Deterministic local OpenAI-compatible transport fixture. Never used by app runtime.
import http from "node:http";
const failures = new Map();
const call = (name, args) => ({
  tool_calls: [
    {
      index: 0,
      id: `call_${name}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    },
  ],
});
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const users = body.messages.flatMap((m, i) =>
        m.role === "user" &&
        !String(m.content).startsWith("User explicitly selected")
          ? [{ i, text: String(m.content) }]
          : [],
      ),
      last = users.at(-1),
      question = last.text,
      outputs = body.messages
        .slice(last.i + 1)
        .filter((m) => m.role === "tool");
    let delta,
      reason = "stop";
    if (question.includes("Provider fails")) {
      const count = (failures.get(question) || 0) + 1;
      failures.set(question, count);
      if (count <= 2) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: { message: "FIXTURE_SECRET_ERROR", type: "test" },
          }),
        );
        return;
      }
      delta = {
        content: "Recovered the same request. No Bearing records were changed.",
      };
    } else if (question.includes("Classify captured thought")) {
      if (!outputs.length) {
        delta = call("search", { q: question.replace("Classify ", "") });
        reason = "tool_calls";
      } else if (outputs.length === 1) {
        const found = JSON.parse(outputs.at(-1).content);
        delta = call("read", { kind: "journal", id: found.results[0].id });
        reason = "tool_calls";
      } else if (outputs.length === 2) {
        const found = JSON.parse(outputs.at(-1).content);
        delta = call("propose", {
          operations: [
            {
              op: "organize_moment",
              key: "new_capture_task",
              id: found.id,
              revision: found.revision,
              data: {
                type: "task",
                title: question.replace("Classify ", "Task from "),
                status: "todo",
              },
            },
          ],
        });
        reason = "tool_calls";
      } else
        delta = {
          content:
            "Review the Task classification. Original Journal text will remain.",
        };
    } else if (question.includes("Organize")) {
      if (!outputs.length) {
        delta = call("propose", {
          operations: [
            {
              op: "create_project",
              key: "new_project",
              data: { name: "Weekend plan" },
            },
            {
              op: "create_item",
              key: "new_task",
              data: {
                type: "task",
                title: "Plan weekend",
                status: "todo",
                projectId: "new_project",
              },
            },
            {
              op: "create_item",
              key: "new_note",
              data: {
                type: "note",
                title: "Weekend ideas",
                content: "A calm weekend",
              },
            },
            {
              op: "link",
              fromId: "new_task",
              toId: "new_note",
              type: "related_to",
            },
          ],
        });
        reason = "tool_calls";
      } else
        delta = {
          content: "Review this related batch. Nothing has been applied.",
        };
    } else if (question.includes("Ambiguous")) {
      if (!outputs.length) {
        delta = call("search", {
          q: question.replace("Ambiguous ", ""),
          type: "person",
        });
        reason = "tool_calls";
      } else delta = { content: "Which Alex did you mean?" };
    } else if (question.includes("Find my Alex")) {
      if (!outputs.length) {
        delta = call("search", { q: question.replace("Find my ", "") });
        reason = "tool_calls";
      } else if (outputs.length === 1) {
        const found = JSON.parse(outputs.at(-1).content);
        delta = call("read", { kind: "item", id: found.results[0].id });
        reason = "tool_calls";
      } else {
        const found = JSON.parse(outputs.at(-1).content);
        delta = {
          content: `Alex recommended The Odyssey. [Recommendation](/app/library/${found.id})`,
        };
      }
    } else
      delta = { content: "Hello. What would you like to find in Bearing?" };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const [value, finish] of [
      [delta, null],
      [{}, reason],
    ])
      res.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta: value, finish_reason: finish }] })}\n\n`,
      );
    res.end("data: [DONE]\n\n");
  } catch {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: { message: "Fixture received unexpected input", type: "test" },
      }),
    );
  }
});
server.listen(5555, "127.0.0.1", () =>
  console.log("Coach fixture listening on 127.0.0.1:5555"),
);
