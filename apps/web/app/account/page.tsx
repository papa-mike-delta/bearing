import { db, users } from "@repo/db";
import { eq } from "drizzle-orm";
import { requireUser } from "../../auth";
import {
  importError,
  importNotice,
  maxPresetInputLength,
} from "../../lib/account-theme";
import { accountError } from "../../lib/account-errors";
import { minPasswordLength } from "../../lib/credentials";
import { changeAccountPassword, importAccountTheme } from "../actions";
import { Header } from "../header";
import { FormMessage } from "./form-message";
import { ImportThemeButton } from "./import-button";
import { ChangePasswordButton } from "./submit-button";

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string; imported?: string }>;
}) {
  const user = await requireUser();
  const { error, changed, imported } = await searchParams;
  const message = accountError(error);
  const themeMessage = importError(error);
  const row =
    imported === "1"
      ? await db.query.users.findFirst({
          where: eq(users.id, user.id),
          columns: { themeCode: true },
        })
      : null;
  const notice = imported === "1" ? importNotice(row?.themeCode ?? null) : null;

  return (
    <main>
      <Header email={user.email} />
      <form action={importAccountTheme}>
        <label>
          Theme
          <input
            name="preset"
            autoComplete="off"
            maxLength={maxPresetInputLength}
            required
          />
        </label>
        <a
          href="https://ui.shadcn.com/create"
          target="_blank"
          rel="noopener noreferrer"
        >
          Design a theme
        </a>
        {notice ? <FormMessage role="status" message={notice} /> : null}
        {themeMessage ? (
          <FormMessage role="alert" message={themeMessage} />
        ) : null}
        <ImportThemeButton />
      </form>
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
