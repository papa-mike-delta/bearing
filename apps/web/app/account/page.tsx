import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
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
import { ClearParam } from "./clear-param";
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
      {imported === "1" || changed === "1" ? <ClearParam /> : null}
      <h1>Theme</h1>
      <form action={importAccountTheme}>
        <div className="field">
          <Label htmlFor="preset">Preset link or code</Label>
          <Input
            id="preset"
            name="preset"
            aria-describedby="preset-hint"
            autoComplete="off"
            maxLength={maxPresetInputLength}
            required
          />
          <p id="preset-hint" className="hint">
            Paste a ui.shadcn.com/create link or its preset code.{" "}
            <a
              href="https://ui.shadcn.com/create"
              target="_blank"
              rel="noopener noreferrer"
            >
              Design a theme
            </a>
          </p>
        </div>
        {notice ? <FormMessage role="status" message={notice} /> : null}
        {themeMessage ? (
          <FormMessage role="alert" message={themeMessage} />
        ) : null}
        <ImportThemeButton />
      </form>
      <h1>Change password</h1>
      <form action={changeAccountPassword}>
        <div className="field">
          <Label htmlFor="current">Current password</Label>
          <Input
            id="current"
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <div className="field">
          <Label htmlFor="next">New password</Label>
          <Input
            id="next"
            name="next"
            type="password"
            autoComplete="new-password"
            minLength={minPasswordLength}
            required
          />
        </div>
        <div className="field">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={minPasswordLength}
            required
          />
        </div>
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
