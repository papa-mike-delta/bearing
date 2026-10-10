import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { db } from "@repo/db";
import { requireUser } from "../../auth";
import {
  importError,
  importNotice,
  maxPresetInputLength,
  themeChoices,
} from "../../lib/account-theme";
import { loadAccountTheme } from "../../lib/account-theme-store";
import { accountError } from "../../lib/account-errors";
import { minPasswordLength } from "../../lib/credentials";
import {
  changeAccountPassword,
  chooseAccountTheme,
  importAccountTheme,
} from "../actions";
import { Header } from "../header";
import { ClearParam } from "./clear-param";
import { FormMessage } from "./form-message";
import { ImportThemeButton } from "./import-button";
import { ChangePasswordButton } from "./submit-button";

export default async function Account({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    changed?: string;
    imported?: string;
  }>;
}) {
  const user = await requireUser();
  const { error, changed, imported } = await searchParams;
  const message = accountError(error);
  const themeMessage = importError(error);
  const account = await loadAccountTheme(db, user.id);
  const notice = imported === "1" ? importNotice(account.code) : null;

  return (
    <main>
      <Header email={user.email} />
      {imported === "1" || changed === "1" ? <ClearParam /> : null}
      <h1>Account</h1>
      <section className="panel" aria-labelledby="theme-title">
        <h2 id="theme-title" className="panel-title">
          Theme
        </h2>
        <p className="panel-description">
          Pick a built-in palette or import one from shadcn/create.
        </p>
        <form action={chooseAccountTheme} className="themes">
          <fieldset>
            <legend>Built-in themes</legend>
            <div className="choices">
              {themeChoices(account).map((choice) => (
                <Button
                  key={choice.id}
                  type="submit"
                  name="choice"
                  value={choice.id}
                  variant={choice.selected ? "default" : "outline"}
                  aria-pressed={choice.selected}
                >
                  {choice.name}
                </Button>
              ))}
            </div>
          </fieldset>
        </form>
        <form action={importAccountTheme} className="mt-6 max-w-sm">
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
      </section>
      <section className="panel" aria-labelledby="password-title">
        <h2 id="password-title" className="panel-title">
          Change password
        </h2>
        <p className="panel-description">
          Changing it signs out your other sessions.
        </p>
        <form action={changeAccountPassword} className="max-w-sm">
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
      </section>
    </main>
  );
}
