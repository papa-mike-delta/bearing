import { redirect } from "next/navigation";
import { auth } from "../auth";
import { signOutOfBearing } from "./actions";

export default async function Home() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");

  return (
    <main>
      <header>
        <span>{session.user.email}</span>
        <form action={signOutOfBearing}>
          <button type="submit">Sign out</button>
        </form>
      </header>
      <p>No tasks yet.</p>
    </main>
  );
}
