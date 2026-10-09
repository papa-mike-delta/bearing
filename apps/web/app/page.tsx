import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  maxPriority,
  maxTaskNameLength,
  minPriority,
  nextTask,
} from "@repo/domain";
import { requireUser } from "../auth";
import { Header } from "./header";
import { openTasks } from "../lib/tasks";
import {
  addTaskToList,
  changeTaskPriority,
  completeTaskOnList,
} from "./actions";

export default async function Home() {
  const user = await requireUser();
  const tasks = await openTasks(user.id);
  const next = nextTask(tasks);

  return (
    <main>
      <Header email={user.email} />
      <form action={addTaskToList}>
        <Input
          name="name"
          aria-label="Task name"
          placeholder="New task"
          maxLength={maxTaskNameLength}
          required
        />
        <Button type="submit">Add</Button>
      </form>
      {tasks.length === 0 ? (
        <p>No tasks yet.</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <form action={completeTaskOnList}>
                <input type="hidden" name="id" value={task.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="icon-xs"
                  className="size-4 rounded-full"
                  aria-label={`Complete ${task.name}`}
                />
              </form>
              <span>
                {task.name}
                {task.note ? <small>{task.note}</small> : null}
              </span>
              {task === next ? <strong>Next</strong> : null}
              <form action={changeTaskPriority}>
                <input type="hidden" name="id" value={task.id} />
                <Button
                  type="submit"
                  name="step"
                  value="up"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={`Raise ${task.name}`}
                  disabled={task.priority >= maxPriority}
                >
                  ↑
                </Button>
                <Button
                  type="submit"
                  name="step"
                  value="down"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground"
                  aria-label={`Lower ${task.name}`}
                  disabled={task.priority <= minPriority}
                >
                  ↓
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
