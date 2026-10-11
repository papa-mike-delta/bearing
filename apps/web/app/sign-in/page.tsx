import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { minPasswordLength } from "../../lib/credentials";
import { createAccount, signInWithPassword } from "../actions";
import { SubmitButtons } from "./submit-buttons";

const errors: Record<string, string> = {
  "wrong-password": "Wrong email or password.",
  invalid: `Enter an email and a password of at least ${minPasswordLength} characters.`,
  taken: "An account with that email already exists. Sign in instead.",
};

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await auth()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="auth">
      <div className="auth-card panel">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <span className="brand-name">Bearing</span>
        </div>
        <h1>Welcome back</h1>
        <p className="panel-description">
          Sign in, or create an account with a new email.
        </p>
        <form>
          <div className="field">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={minPasswordLength}
              required
            />
          </div>
          {error && Object.hasOwn(errors, error) ? (
            <p role="alert" className="text-destructive">
              {errors[error]}
            </p>
          ) : null}
          <SubmitButtons
            signIn={signInWithPassword}
            createAccount={createAccount}
          />
        </form>
      </div>
    </main>
  );
}
