import { maxPriority, minPriority, nextTask } from "@repo/domain";
import { requireUser } from "../auth";
import { openTasks } from "../lib/tasks";
import {
  addTaskToList,
  changeTaskPriority,
  completeTaskOnList,
  signOutOfBearing,
} from "./actions";

export default async function Home() {
  const user = await requireUser();
  const tasks = await openTasks(user.id);
  const next = nextTask(tasks);

  return (
    <main>
      <header>
        <span>{user.email}</span>
        <form action={signOutOfBearing}>
          <button type="submit">Sign out</button>
        </form>
      </header>
      <form action={addTaskToList}>
        <input
          name="name"
          aria-label="Task name"
          placeholder="New task"
          required
        />
        <button type="submit">Add</button>
      </form>
      {tasks.length === 0 ? (
        <p>No tasks yet.</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <form action={completeTaskOnList}>
                <input type="hidden" name="id" value={task.id} />
                <button
                  type="submit"
                  className="complete"
                  aria-label={`Complete ${task.name}`}
                />
              </form>
              <span>{task.name}</span>
              {task === next ? <strong>Next</strong> : null}
              <form action={changeTaskPriority}>
                <input type="hidden" name="id" value={task.id} />
                <button
                  type="submit"
                  name="step"
                  value="up"
                  aria-label={`Raise ${task.name}`}
                  disabled={task.priority >= maxPriority}
                >
                  ↑
                </button>
                <button
                  type="submit"
                  name="step"
                  value="down"
                  aria-label={`Lower ${task.name}`}
                  disabled={task.priority <= minPriority}
                >
                  ↓
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
