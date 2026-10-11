import { Button } from "@repo/ui/components/button";
import Link from "next/link";
import { signOutOfBearing } from "./actions";
import { NavLinks } from "./nav-links";

export function Header({ email }: { email?: string | null }) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/" className="brand" aria-label="Bearing home">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <span className="brand-name">Bearing</span>
        </Link>
        <NavLinks />
        <span className="app-email">{email}</span>
        <form action={signOutOfBearing}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
