import { requireUser } from "../../auth";
import { minPasswordLength } from "../../lib/credentials";
import { changeAccountPassword } from "../actions";
import { Header } from "../header";

const errors: Record<string, string> = {
  "wrong-password": "That current password isn't right.",
  invalid: `Use a new password of at least ${minPasswordLength} characters.`,
  mismatch: "The new password and the confirmation don't match.",
  unavailable: "The password couldn't be changed. Try again.",
};

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  const user = await requireUser();
  const { error, changed } = await searchParams;

  return (
    <main>
      <Header email={user.email} />
      <h1>Change password</h1>
      <form action={changeAccountPassword}>
        <label>
          Current password
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          New password
          <input
            name="next"
            type="password"
            autoComplete="new-password"
            minLength={minPasswordLength}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={minPasswordLength}
            required
          />
        </label>
        {changed === "1" ? (
          <p role="status">Password changed. Other sessions were signed out.</p>
        ) : null}
        {error && errors[error] ? <p role="alert">{errors[error]}</p> : null}
        <button type="submit">Change password</button>
      </form>
    </main>
  );
}
