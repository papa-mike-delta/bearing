/** Closed Coach trust behaviors. Copy here is the effect Settings shows. */
export const trustPatternIds = [
  "file_raw_moment",
  "create_open_task",
  "link_existing",
] as const;
export type TrustPatternId = (typeof trustPatternIds)[number];
export const trustPatterns: {
  id: TrustPatternId;
  title: string;
  effect: string;
}[] = [
  {
    id: "file_raw_moment",
    title: "File one raw Journal or Inbox entry",
    effect:
      "A fresh Coach proposal may turn exactly one raw Journal or Inbox entry into one new Task or Note with status Inbox or To do and no delegate. The original Journal text stays, and the entry keeps its revision check. The proposal cannot include any other operation. A person, habit, event, goal, bookmark, archived status, or delegate still waits for approval.",
  },
  {
    id: "create_open_task",
    title: "Create one open Task",
    effect:
      "A fresh Coach proposal may create exactly one Task whose status is Inbox or To do, with no delegate. That Task may include its title, notes, priority, dates, an existing Project, and existing tags. The proposal cannot include any other operation. Archive, delegation, a second record, and edits of existing records still wait for approval.",
  },
  {
    id: "link_existing",
    title: "Connect two existing records",
    effect:
      "A fresh Coach proposal may add exactly one connection between two records this account already has. The relationship must already be legal for those records: related to, mentions, advances, tracks, scheduled at, or located at. It cannot create or edit the records, remove a connection, or point at a new record in the same batch. Inferred connection cards still wait for Accept.",
  },
];
