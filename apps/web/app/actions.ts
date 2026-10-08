"use server";

import { db, users } from "@repo/db";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "../auth";
import { hashPassword, parseCredentials } from "../lib/credentials";

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
  const [user] = await db
    .insert(users)
    .values({
      email: credentials.email,
      passwordHash: await hashPassword(credentials.password),
    })
    .onConflictDoNothing()
    .returning({ id: users.id });
  if (!user) redirect("/sign-in?error=taken");
  await signInWithPassword(formData);
}

export async function signOutOfBearing() {
  await signOut({ redirectTo: "/sign-in" });
}
