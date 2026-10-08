import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { minPasswordLength } from "../../lib/credentials";
import { createAccount, signInWithPassword } from "../actions";

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
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={minPasswordLength}
            required
          />
        </label>
        {error && errors[error] ? <p role="alert">{errors[error]}</p> : null}
        <button type="submit" formAction={signInWithPassword}>
          Sign in
        </button>
        <button type="submit" formAction={createAccount}>
          Create account
        </button>
      </form>
    </main>
  );
}
