# People: reach-out rules

## Keeping people and seeing who is due

A person is someone in your life, kept in one of eight ordered groups on People: Family, Extended family, Intimate friends, Close friends, Casual friends, Acquaintances, Business contacts, Almost strangers. Empty groups are hidden. Groups with due people start open; others start collapsed. Several groups can be open, and the choice resets on a new visit. Within a group, due people come first, then future reach-outs soonest, then people without a reach-out day. Names break ties.

The rule uses a number, days/weeks/months and an optional on-day. Turning it on starts at every month. Next reach-out is computed from the shared next-date rule, strictly after last connected. An agreed day replaces that computed day and requires a rule. Without last connected or an agreement, a rule has no due day. Someone is due on or after the reach-out day until it moves forward. These are product rules, not a claim about how often anyone should connect.

Source: Bearing issue #154 and spec §4.5.

## Saving and Paul's boundaries

Adding requires a trimmed name of 1–200 characters and an explicitly chosen group; duplicate names are allowed. A new person has no rule or dates. The person page saves all fields in one explicit Save with an unsaved-changes guard. Connected today and R fill last connected using the browser's Today, but still wait for Save. Last connected cannot be future. An agreed day must be today or later and needs a rule. Deletion asks “Delete this person?” and Cancel keeps the person.

Paul reads people only when needed with listPeople or readPerson. A name must match one person, ignoring case; otherwise he asks and writes nothing. The Task list is the only automatic read. On request he can set last connected, or set or clear an agreed day. A clear first-person statement such as “I saw Ada today” or “Ada and I agreed on Friday” is the request: he writes straight away, as with habit logging, without asking first. He never treats a name as a real person, or states facts about one, without looking it up in that turn; an unknown name gets a refused result and the receipt “No change: asked about '<name>'”. These share the three-write cap and content-matched resend protection. A refusal writes nothing and releases its slot.

Paul cannot add, rename, regroup or delete a person, set or clear their rule, or create a link outside logNoteOnPerson. People have no occasion date.

Source: Bearing issue #154 and spec §§8.2–8.7.

## Related links

People can be linked to Tasks, Notes, saved Journal days, or other people in either direction by the user through Related. Add link searches this account’s people by name, twenty at a time. The person page shows Outgoing and Backlinks, newest first. A backlink opens its source; only outgoing links can be removed. Removing a link leaves both records. Deleting a person removes every link touching them in the same transaction and leaves Tasks, Notes and Journal days. Names and addresses are read when shown. Paul cannot create links outside logNoteOnPerson; he directs the user to Add link in Related. People have no occasion date; a linked Note may have one.


## Log a note on a person

On explicit request, logNoteOnPerson logs exact text as a new Note with no notebook and an outgoing person → Note Related link. The first nonblank line is the title, the rest is the body. A person name must match exactly one owned person ignoring case. Empty text, unknown or ambiguous names, and future occasion dates are refused with a neutral No change receipt and release the write slot. Only use an optional occasion day the person states, never infer it from prose. This uses one of the three write slots; content-matched resends return the original Note without another edge. The receipt is Logged a note on 'Ada', linking to the Note, including after reload. This is the only link Paul can create: he cannot attach an existing Note, link a Task or Journal day to a person, or create person-to-person links. The user's person-to-person Related controls stay available. readPerson returns up to 20 linked Notes in both directions, newest edge first, each with title, occasion date or none, and body cut at 2000 characters; its receipt stays Read 'Ada' linked to the person. Person Add note writes immediately; Inbox Log on person archives only after the Note and edge succeed in the same transaction. Deleting a Note removes its edges; deleting a person removes edges and keeps the Note.

Source: Bearing issue #158.
