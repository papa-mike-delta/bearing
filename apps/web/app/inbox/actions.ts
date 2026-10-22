"use server";
import { fileDraftOnPerson } from '../../lib/draft-filing/index';
import { NoteError, noteHref } from '../../lib/notes';


import { revalidatePath } from "next/cache";
import { requireUser } from "../../auth";
import { fileDraftAsJournal } from "../../lib/draft-filing/index";
import { JournalError } from "../../lib/journal";

export async function fileJournal(draftId: string, day: string, today: string): Promise<{ day: string } | { error: string }> {
  const user = await requireUser();
  try {
    const receipt = await fileDraftAsJournal(user.id, draftId, { day, today });
    revalidatePath("/inbox");
    revalidatePath(`/journal/${receipt.day}`);
    return { day: receipt.day };
  } catch (error) {
    return { error: error instanceof JournalError ? error.message : "Could not append. Please retry; a committed append will not add the text twice." };
  }
}

export async function logDraftOnPerson(draftId:string,name:string,occasionDate:string|null,today:string) {
 const user=await requireUser();
 try {
 const note=await fileDraftOnPerson(user.id,draftId,{name,occasionDate,today});
 revalidatePath('/inbox');revalidatePath('/people','layout');revalidatePath('/notes','layout');
 return {href:noteHref(null,note.id)};
 }catch(error){return {error:error instanceof NoteError?error.message:'Could not log. Retry to return the saved Note without a duplicate.'};}
}
