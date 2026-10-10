import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { maxAreaNameLength, maxTaskNameLength } from "@repo/domain";
import { requireUser } from "../auth";
import { loadAccount, orderedAreas } from "../lib/areas";
import { createNamedArea, deleteNamedArea, saveArea } from "./actions";
import { Header } from "./header";
import { TaskStacks, type StackArea, type StackGoal, type StackTask } from "./task-stacks";

const errors: Record<string, string> = {
  "area-name": `That name is empty, too long, or already an Area. Names can be ${maxAreaNameLength} characters.`,
  "area-tasks": "That Area still has Tasks, so it can't be deleted.",
  task: `Couldn't add that task. The name has to be ${maxTaskNameLength} characters or fewer, and there has to be an Area.`,
  date: "A date has to be after today.",
  limit: "The limit has to be a whole number, 1 or more.",
  goal: "That Goal name is empty, too long, or already in this Area, or it isn't a Goal here.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const [{ error }, loaded] = await Promise.all([
    searchParams,
    loadAccount(user.id),
  ]);
  const managed = orderedAreas(loaded);
  const areas: StackArea[] = loaded.areas.map((area) => ({
    id: area.id,
    name: area.name,
    workflow: area.workflow,
    wipLimit: area.wipLimit,
    createdAt: area.createdAt.toISOString(),
  }));
  const tasks: StackTask[] = loaded.tasks.map((task) => ({
    id: task.id,
    areaId: task.areaId,
    name: task.name,
    note: task.note,
    priority: task.priority,
    status: task.status,
    previousStatus: task.previousStatus,
    age: task.age,
    date: task.date,
    goalId: task.goalId,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
  }));

  const goals: StackGoal[] = loaded.goals;
  const wide = areas.some(
    (area) =>
      area.workflow === "kanban" && !loaded.hiddenAreaIds.includes(area.id),
  );

  return (
    <main className={wide ? "wide" : undefined}>
      <Header email={user.email} />
      {error && Object.hasOwn(errors, error) ? (
        <p role="alert">{errors[error]}</p>
      ) : null}
      {managed.length === 0 ? (
        <form action={createNamedArea}>
          <h1>Name an area</h1>
          <Input
            name="name"
            aria-label="Area name"
            placeholder="Work, Personal, …"
            maxLength={maxAreaNameLength}
            required
          />
          <Button type="submit">Create</Button>
        </form>
      ) : (
        <>
          <h1>Tasks</h1>
          <TaskStacks
            areas={areas}
            tasks={tasks}
            goals={goals}
            hiddenAreaIds={loaded.hiddenAreaIds}
          />
          <details>
            <summary>Manage areas</summary>
            <ul className="manager">
              {managed.map((area) => (
                <li key={area.id}>
                  <form
                    key={`${area.id}-${area.name}-${area.hidden}-${area.workflow}-${area.wipLimit}`}
                    action={saveArea}
                  >
                    <input type="hidden" name="id" value={area.id} />
                    <Input
                      name="name"
                      aria-label={`Rename ${area.name}`}
                      className="w-40"
                      defaultValue={area.name}
                      maxLength={maxAreaNameLength}
                      required
                    />
                    <label className="text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        name="hidden"
                        defaultChecked={area.hidden}
                      />{" "}
                      Hidden
                    </label>
                    <select
                      className="choice"
                      name="workflow"
                      aria-label={`Workflow for ${area.name}`}
                      defaultValue={area.workflow}
                    >
                      <option value="priority-list">Priority List</option>
                      <option value="now-later">Now/Later</option>
                      <option value="kanban">Kanban</option>
                    </select>
                    <Input
                      name="limit"
                      type="number"
                      min={1}
                      aria-label={`Limit for ${area.name}`}
                      className="w-20"
                      defaultValue={area.wipLimit}
                      required
                    />
                    <Button type="submit" variant="outline" size="xs">
                      Save
                    </Button>
                  </form>
                  <form className="ml-auto" action={deleteNamedArea}>
                    <input type="hidden" name="id" value={area.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="xs"
                      disabled={area.taskCount > 0}
                      title={
                        area.taskCount > 0
                          ? "This Area still has Tasks"
                          : undefined
                      }
                    >
                      Delete
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 24 }}>
              <form action={createNamedArea}>
                <Input
                  name="name"
                  aria-label="New area name"
                  placeholder="New area"
                  maxLength={maxAreaNameLength}
                  required
                />
                <Button type="submit" variant="outline">
                  Add area
                </Button>
              </form>
            </div>
          </details>
        </>
      )}
    </main>
  );
}
