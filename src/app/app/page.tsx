import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import type { Metadata } from "next";
import { Workflow } from "@/lib/v1/workflow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your workspace",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AppPage() {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value ?? "");
  if (!session?.twoFactorVerified) redirect("/login");
  const preferences = await Workflow.preferences(session.userId);
  const startup = ["today", "journal", "inbox", "projects", "library", "calendar"].includes(String(preferences.startup)) ? String(preferences.startup) : "today";
  redirect(`/app/${startup}`);
}
