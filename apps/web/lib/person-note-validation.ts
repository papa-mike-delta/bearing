export function personNoteError({ day, today, text, draft, name }: {
  day: string; today: string; text: string; draft: boolean; name: string;
}): string {
  if (day && day > today) return "Pick today or an earlier day.";
  if (draft ? !name.trim() : !text.trim()) {
    return draft ? "Choose a person to log this draft on." : "Write a note before adding it.";
  }
  return "";
}
