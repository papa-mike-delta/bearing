import { requireUser } from "../../auth";
import { accountError } from "../../lib/account-errors";
import { minPasswordLength } from "../../lib/credentials";
import { changeAccountPassword } from "../actions";
import { Header } from "../header";
import { FormMessage } from "./form-message";
import { ChangePasswordButton } from "./submit-button";

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  const user = await requireUser();
  const { error, changed } = await searchParams;
  const message = accountError(error);

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
          <FormMessage
            role="status"
            message="Password changed. Other sessions were signed out."
          />
        ) : null}
        {message ? <FormMessage role="alert" message={message} /> : null}
        <ChangePasswordButton />
      </form>
    </main>
  );
}
