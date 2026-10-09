"use server";

import { db, users } from "@repo/db";
import { maxDraftLength } from "@repo/domain";
import { CredentialsSignin } from "next-auth";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, signIn, signOut } from "../auth";
import {
  defaultAccountTheme,
  readPreset,
  takeImport,
} from "../lib/account-theme";
import {
  saveAccountTheme,
  switchAccountTheme,
} from "../lib/account-theme-store";
import { hashPassword, parseCredentials } from "../lib/credentials";
import { changePassword } from "../lib/password";
import { captureDraft, fileDraftAsTask } from "../lib/drafts";
import { expandPreset } from "../lib/expand-preset";
import {
  addTask,
  changePriority,
  completeTask,
  createArea,
} from "../lib/tasks";

export async function signInWithPassword(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    // Only a refused email/password. A database or config failure throws.
    if (error instanceof CredentialsSignin) {
      redirect("/sign-in?error=wrong-password");
    }
    throw error;
  }
}

export async function createAccount(formData: FormData) {
  const credentials = parseCredentials(Object.fromEntries(formData));
  if (!credentials) redirect("/sign-in?error=invalid");
  const passwordHash = await hashPassword(credentials.password);
  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email: credentials.email, passwordHash })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (user) await createArea(user.id, tx);
    return Boolean(user);
  });
  if (!created) redirect("/sign-in?error=taken");
  await signInWithPassword(formData);
}

export async function signOutOfBearing() {
  await signOut({ redirectTo: "/sign-in" });
}

export async function importAccountTheme(formData: FormData) {
  const user = await requireUser();
  const input = String(formData.get("preset") ?? "");
  const code = readPreset(input);
  if (!code) redirect("/account?error=theme");
  let blocks: { light: string; dark: string } | null = null;
  try {
    blocks = await expandPreset(code);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "account.theme.error",
        error: error instanceof Error ? error.name : typeof error,
      }),
    );
  }
  const result = takeImport(defaultAccountTheme, input, blocks);
  if (result.error || result.account.choice !== "imported") {
    redirect("/account?error=theme-failed");
  }
  await saveAccountTheme(db, user.id, result.account);
  revalidatePath("/", "layout");
  redirect("/account?imported=1");
}

export async function chooseAccountTheme(formData: FormData) {
  const user = await requireUser();
  const next = await switchAccountTheme(
    db,
    user.id,
    String(formData.get("choice") ?? ""),
  );
  if (next.error) redirect("/account");
  revalidatePath("/", "layout");
  redirect("/account");
}

export async function addTaskToList(formData: FormData) {
  const { id: userId } = await requireUser();
  await addTask(userId, { name: String(formData.get("name") ?? "") });
  revalidatePath("/");
}

export async function completeTaskOnList(formData: FormData) {
  const { id: userId } = await requireUser();
  await completeTask(userId, String(formData.get("id")));
  revalidatePath("/");
}

export async function changeTaskPriority(formData: FormData) {
  const { id: userId } = await requireUser();
  const raw = formData.get("step");
  const step = raw === "up" ? 1 : raw === "down" ? -1 : null;
  if (step) await changePriority(userId, String(formData.get("id")), step);
  revalidatePath("/");
}

export async function captureToInbox(formData: FormData) {
  const { id: userId } = await requireUser();
  // Browsers submit textarea line breaks as \r\n; store \n so the length
  // check matches what the user typed.
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n");
  if (!body.trim()) redirect("/inbox?error=empty");
  if (body.length > maxDraftLength) redirect("/inbox?error=too-long");
  await captureDraft(userId, body);
  revalidatePath("/inbox");
  redirect("/inbox"); // clears a stale ?error
}

export async function fileDraft(formData: FormData) {
  const { id: userId } = await requireUser();
  const filed = await fileDraftAsTask(userId, String(formData.get("id")));
  revalidatePath("/inbox");
  revalidatePath("/");
  redirect(filed ? "/inbox" : "/inbox?error=cannot-file");
}

export async function changeAccountPassword(formData: FormData) {
  const user = await requireUser();
  const jar = await cookies();
  const keepSession =
    jar.get("__Secure-authjs.session-token")?.value ??
    jar.get("authjs.session-token")?.value ??
    null;
  let result: Awaited<ReturnType<typeof changePassword>>;
  try {
    result = await changePassword(
      user.id,
      {
        current: formData.get("current"),
        next: formData.get("next"),
        confirm: formData.get("confirm"),
      },
      { keepSession },
    );
  } catch (error) {
    // A database failure stays on the server, logged by error name only so no
    // query or value lands in the logs. The page only gets a reason.
    console.error(
      JSON.stringify({
        event: "account.password.error",
        error: error instanceof Error ? error.name : typeof error,
      }),
    );
    redirect("/account?error=unavailable");
  }
  if (!result.ok) redirect(`/account?error=${result.error}`);
  redirect("/account?changed=1");
}
