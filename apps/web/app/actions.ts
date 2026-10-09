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
  createArea,
  deleteArea,
  renameArea,
  setAreaHidden,
  setAreaWip,
  setAreaWorkflow,
} from "../lib/areas";
import {
  addTask,
  changePriority,
  completeTask,
  moveTask,
  scheduleOn,
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
  const [user] = await db
    .insert(users)
    .values({ email: credentials.email, passwordHash })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (!user) redirect("/sign-in?error=taken");
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

export async function createNamedArea(formData: FormData) {
  const { id: userId } = await requireUser();
  const created = await createArea(userId, String(formData.get("name") ?? ""));
  revalidatePath("/");
  if (!created) redirect("/?error=area-name");
}

export async function saveArea(formData: FormData) {
  const { id: userId } = await requireUser();
  const id = String(formData.get("id"));
  const renamed = await renameArea(
    userId,
    id,
    String(formData.get("name") ?? ""),
  );
  await setAreaHidden(userId, id, formData.has("hidden"));
  await setAreaWorkflow(userId, id, String(formData.get("workflow") ?? ""));
  const limit = Number(formData.get("limit"));
  const saved = await setAreaWip(userId, id, limit);
  revalidatePath("/");
  if (!renamed) redirect("/?error=area-name");
  if (!saved) redirect("/?error=limit");
}

export async function deleteNamedArea(formData: FormData) {
  const { id: userId } = await requireUser();
  const result = await deleteArea(userId, String(formData.get("id")));
  revalidatePath("/");
  if (result === "has-tasks") redirect("/?error=area-tasks");
}

export async function addTaskToList(formData: FormData) {
  const { id: userId } = await requireUser();
  const added = await addTask(userId, {
    name: String(formData.get("name") ?? ""),
    note: String(formData.get("note") ?? "") || undefined,
    area: String(formData.get("area") ?? "") || undefined,
    today: String(formData.get("today") ?? ""),
  });
  revalidatePath("/");
  if (!added) redirect("/?error=task");
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

export async function moveTaskOnList(formData: FormData) {
  const { id: userId } = await requireUser();
  const to = formData.get("to") === "now" ? "now" : "later";
  await moveTask(userId, String(formData.get("id")), to);
  revalidatePath("/");
}

export async function scheduleTaskOnList(formData: FormData) {
  const { id: userId } = await requireUser();
  const saved = await scheduleOn(
    userId,
    String(formData.get("id")),
    String(formData.get("date") ?? ""),
    String(formData.get("today") ?? ""),
  );
  revalidatePath("/");
  if (!saved) redirect("/?error=date");
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
  const area = String(formData.get("area") ?? "");
  const filed = await fileDraftAsTask(
    userId,
    String(formData.get("id")),
    undefined,
    {
      today: String(formData.get("today") ?? ""),
      ...(area ? { area } : {}),
    },
  );
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
