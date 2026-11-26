"use client";
import { templates, type CanonicalItem } from "@/lib/v1/contracts";
import { localDateTime, instantFromInput } from "@/lib/v1/workflow-dates";
import { fieldClass, useWorkspace } from "./context";
export const typeNames: Record<CanonicalItem["type"], string> = {
  task: "Task",
  note: "Note",
  person: "Person",
  bookmark: "Bookmark",
  habit: "Habit",
  event: "Event",
  goal: "Goal",
};
export function newItemSeed(type: CanonicalItem["type"], timezone: string) {
  return {
    type,
    template: type === "bookmark" ? "web" : type,
    title: "",
    content: "",
    status: "todo",
    priority: 0,
    timezone,
    tagIds: [],
    metadata:
      type === "bookmark"
        ? { version: 1, category: "web", url: "" }
        : { version: 1 },
  };
}
export function StructuredFields({
  data,
  change,
  onError,
}: {
  data: Record<string, any>;
  change(patch: Record<string, any>): void;
  onError(message: string): void;
}) {
  const { data: workspace, timezone } = useWorkspace();
  const type = data.type as CanonicalItem["type"],
    m = data.metadata || { version: 1 };
  const meta = (patch: Record<string, any>) =>
    change({ metadata: { ...m, ...patch } });
  const text = (
    label: string,
    key: string,
    options: { type?: string; required?: boolean; list?: string } = {},
  ) => (
    <label className="block text-sm" key={key}>
      {label}
      <input
        className={fieldClass}
        type={options.type || "text"}
        required={options.required}
        list={options.list}
        value={m[key] ?? ""}
        onChange={(e) => meta({ [key]: e.target.value || undefined })}
      />
    </label>
  );
  const number = (label: string, key: string, min = 0, max?: number) => (
    <label className="block text-sm" key={key}>
      {label}
      <input
        className={fieldClass}
        type="number"
        step="any"
        min={min}
        max={max}
        value={m[key] ?? ""}
        onChange={(e) =>
          meta({ [key]: e.target.value === "" ? undefined : +e.target.value })
        }
      />
    </label>
  );
  const time = (label: string, key: string) => (
    <label className="block text-sm" key={key}>
      {label} · {timezone}
      <input
        className={fieldClass}
        type="datetime-local"
        value={data[key] ? localDateTime(data[key], timezone) : ""}
        onChange={(e) => {
          try {
            change({
              [key]: e.target.value
                ? instantFromInput(e.target.value, timezone)
                : null,
              ...(key === "dueAt" && e.target.value ? { localDate: null } : {}),
            });
            onError("");
          } catch (err) {
            onError((err as Error).message);
          }
        }}
      />
    </label>
  );
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Template
        <select
          className={fieldClass}
          value={data.template}
          onChange={(e) => {
            const template = e.target.value;
            change({
              template,
              ...(type === "bookmark"
                ? {
                    metadata:
                      template === "media"
                        ? { version: 1, category: template, format: "Book" }
                        : template === "file"
                          ? { version: 1, category: template, reference: "" }
                          : template === "web"
                            ? { version: 1, category: template, url: "" }
                            : { version: 1, category: template },
                  }
                : {}),
            });
          }}
        >
          {templates[type].map((t) => (
            <option key={t} value={t}>
              {t === "routine" ? "Routine (Habit checklist)" : t}
            </option>
          ))}
        </select>
      </label>
      {type === "person" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {text("Email", "email", { type: "email" })}
            {text("Phone", "phone")}
            {text("Birthday", "birthday", { type: "date" })}
            {text("Relationship", "relationship")}
          </div>
          <fieldset className="space-y-2">
            <legend>Important dates</legend>
            {(m.importantDates || []).map(
              (d: { label: string; date: string }, index: number) => (
                <div key={index} className="flex flex-wrap gap-2">
                  <input
                    aria-label={`Date label ${index + 1}`}
                    required
                    className={fieldClass}
                    value={d.label}
                    onChange={(e) =>
                      meta({
                        importantDates: m.importantDates.map(
                          (v: any, i: number) =>
                            i === index ? { ...v, label: e.target.value } : v,
                        ),
                      })
                    }
                  />
                  <input
                    aria-label={`Important date ${index + 1}`}
                    required
                    type="date"
                    className={fieldClass}
                    value={d.date}
                    onChange={(e) =>
                      meta({
                        importantDates: m.importantDates.map(
                          (v: any, i: number) =>
                            i === index ? { ...v, date: e.target.value } : v,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="min-h-11 text-sm underline"
                    onClick={() =>
                      meta({
                        importantDates: m.importantDates.filter(
                          (_: any, i: number) => i !== index,
                        ),
                      })
                    }
                  >
                    Remove date {index + 1}
                  </button>
                </div>
              ),
            )}
            <button
              type="button"
              className="min-h-11 text-sm underline"
              onClick={() =>
                meta({
                  importantDates: [
                    ...(m.importantDates || []),
                    { label: "", date: "" },
                  ],
                })
              }
            >
              Add important date
            </button>
          </fieldset>
        </>
      )}
      {type === "bookmark" && (
        <>
          {m.category === "media" && (
            <>
              {text("Media format", "format", {
                required: true,
                list: "media-formats",
              })}
              <datalist id="media-formats">
                {[
                  "Book",
                  "Film",
                  "Series",
                  "Podcast",
                  "Article",
                  "Album",
                  "Game",
                  "Course",
                ].map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
              {text("Creator", "creator")}
            </>
          )}
          {m.category === "place" && (
            <>
              {text("Address", "address")}
              <div className="grid gap-3 sm:grid-cols-2">
                {number("Latitude", "latitude", -90, 90)}
                {number("Longitude", "longitude", -180, 180)}
              </div>
            </>
          )}
          {m.category === "file" &&
            text("External file reference", "reference", { required: true })}
          {text(
            m.category === "web" ? "Web URL" : "Reference URL (optional)",
            "url",
            { type: "url", required: m.category === "web" },
          )}
        </>
      )}
      {(type === "habit" || type === "task") && (
        <div className="grid gap-3 sm:grid-cols-2">
          {number("Target quantity (optional)", "quantity")}
          {text("Unit", "unit")}
        </div>
      )}
      {type === "habit" && (
        <>
          <label className="block text-sm">
            Cadence
            <select
              className={fieldClass}
              value={m.cadence || "daily"}
              onChange={(e) => meta({ cadence: e.target.value })}
            >
              {["daily", "weekly", "monthly"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            Routine steps use ordinary Markdown checkboxes below. Each cadence
            period starts with fresh occurrence checkmarks. Completing a step
            does not complete the Habit.
          </p>
        </>
      )}
      {type === "goal" && (
        <label className="block text-sm">
          Desired outcome
          <textarea
            className={fieldClass}
            value={m.outcome || ""}
            onChange={(e) => meta({ outcome: e.target.value })}
          />
        </label>
      )}
      {type === "event" && (
        <>
          {time("Starts", "startAt")}
          {time("Ends", "endAt")}
          {text("Location", "location")}
        </>
      )}
      {type === "task" && (
        <>
          <label className="block text-sm">
            Delegation Person
            <select
              className={fieldClass}
              value={data.delegateId || ""}
              onChange={(e) => change({ delegateId: e.target.value || null })}
            >
              <option value="">Nobody selected</option>
              {workspace.items
                .filter((i) => i.type === "person" && i.status !== "archived")
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.title}
                  </option>
                ))}
            </select>
          </label>
          {time("Follow-up", "followUpAt")}
          {time("Due deadline (optional time)", "dueAt")}
        </>
      )}
    </div>
  );
}
