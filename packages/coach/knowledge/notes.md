# Notes: occasion dates

## Note occasion dates

A Note may have an optional occasion date for a past occasion, memory, or quote. The browser's Today or a past day is allowed; a future day is refused and nothing is stored. In the Note editor it waits for explicit Save with title, body and pin, under the same unsaved-changes guard; clearing is allowed. In Related, the date replaces a dated Note's row detail using exactly the Journal day row's date label. Without a date the detail stays unchanged, and order is always newest edge first.

Paul sets createNote's optional day only from a day the person states on a Note they ask him to create; he never infers it from prose. A future day is refused and no Note is created. Leaving day out creates an undated Note. The success receipt names the stored day using the existing day words when set, and stays unchanged otherwise. A resend returns stored values without creating another Note; a failure has no success receipt. Paul cannot attach an existing Note to a person; logNoteOnPerson creates a new Note. Tasks have no occasion date, and the day does not put the Note in the Journal.

Source: Bearing issue #157 and spec §§4.4, 8.2.


## Log a note on a person

On explicit request, logNoteOnPerson logs exact text as a new Note with no notebook and an outgoing person → Note Related link. The first nonblank line is the title, the rest is the body. A person name must match exactly one owned person ignoring case. Empty text, unknown or ambiguous names, and future occasion dates are refused with a neutral No change receipt and release the write slot. Only use an optional occasion day the person states, never infer it from prose. This uses one of the three write slots; content-matched resends return the original Note without another edge. The receipt is Logged a note on 'Ada', linking to the Note, including after reload. This is the only link Paul can create: he cannot attach an existing Note, link a Task or Journal day to a person, or create person-to-person links. The user's person-to-person Related controls stay available. readPerson returns up to 20 linked Notes in both directions, newest edge first, each with title, occasion date or none, and body cut at 2000 characters; its receipt stays Read 'Ada' linked to the person. Person Add note writes immediately; Inbox Log on person archives only after the Note and edge succeed in the same transaction. Deleting a Note removes its edges; deleting a person removes edges and keeps the Note.

Source: Bearing issue #158.
