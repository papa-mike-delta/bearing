import { taskForBrowser } from "../../../../lib/task-for-browser";
import { nextDatePhrase } from "@repo/domain";
import { TaskRule } from "../../../../components/task-rule";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "../../../../auth";
import { related } from "../../../../lib/links";
import { taskDetail } from "../../../../lib/tasks";
import { Related } from "../../../../components/related";
import { Header } from "../../../header";
import { OpenTaskActions } from "../../../task-stacks";

const statusLabel: Record<string, string> = {
  later: "Later",
  next: "Next",
  started: "In progress",
  waiting: "Waiting",
  completed: "Completed",
};

export default async function TaskItemPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const user = await requireUser();
  const { taskId } = await params;
  const detail = await taskDetail(user.id, taskId);
  if (!detail) notFound();
  const lists = await related(user.id, { kind: "task", id: detail.task.id });
  const { task, area, goals } = detail;
  return (
    <>
      <Header email={user.email} />
      <main className="font-sans">
        <Link href="/">Tasks</Link>
        <h1>{task.name}</h1>
        <p>Area: {area.name}</p>
        <p>Status: {statusLabel[task.status] ?? task.status}</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{task.note || "No note"}</p>
        {task.rule ? <p>{nextDatePhrase(task.rule)}</p> : null}
        {!task.completedAt && task.status !== "completed" ? (
          <TaskRule id={task.id} initial={task.rule ?? null} />
        ) : null}
        <OpenTaskActions
          task={taskForBrowser(task)}
          goals={goals}
          workflow={area.workflow}
        />
        <Related source={{ kind: "task", id: task.id }} initial={lists} />
      </main>
    </>
  );
}
