"use server";

import { db, users } from "@repo/db";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, signIn, signOut } from "../auth";
import { hashPassword, parseCredentials } from "../lib/credentials";
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
    if (error instanceof AuthError) redirect("/sign-in?error=wrong-password");
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

export async function addTaskToList(formData: FormData) {
  const { id: userId } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (name) await addTask(userId, name);
  revalidatePath("/");
}

export async function completeTaskOnList(formData: FormData) {
  const { id: userId } = await requireUser();
  await completeTask(userId, String(formData.get("id")));
  revalidatePath("/");
}

export async function changeTaskPriority(formData: FormData) {
  const { id: userId } = await requireUser();
  const step = formData.get("step") === "up" ? 1 : -1;
  await changePriority(userId, String(formData.get("id")), step);
  revalidatePath("/");
}
