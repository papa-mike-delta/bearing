import Link from "next/link";
import { signOutOfBearing } from "./actions";

export function Header({ email }: { email?: string | null }) {
  return (
    <header>
      <nav>
        <Link href="/">Tasks</Link>
        <Link href="/inbox">Inbox</Link>
      </nav>
      <span>{email}</span>
      <form action={signOutOfBearing}>
        <button type="submit">Sign out</button>
      </form>
    </header>
  );
}
