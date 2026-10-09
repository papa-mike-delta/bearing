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
    <main>
      <h1>Bearing</h1>
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
          <p role="alert">{errors[error]}</p>
        ) : null}
        <SubmitButtons
          signIn={signInWithPassword}
          createAccount={createAccount}
        />
      </form>
    </main>
  );
}
