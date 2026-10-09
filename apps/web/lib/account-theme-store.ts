import { users } from "@repo/db";
import { eq } from "drizzle-orm";
import { defaultAccountTheme, type AccountTheme } from "./account-theme.ts";
import type { Db } from "./db.ts";

// The theme stored for one Account, or the shared default when that user has
// no row.
export async function loadAccountTheme(
  db: Db,
  userId: string,
): Promise<AccountTheme> {
  const [row] = await db
    .select({
      themeChoice: users.themeChoice,
      themeCode: users.themeCode,
      themeLight: users.themeLight,
      themeDark: users.themeDark,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) return defaultAccountTheme;
  return {
    choice: row.themeChoice,
    code: row.themeCode,
    light: row.themeLight,
    dark: row.themeDark,
  };
}

// Writes the theme columns for this user only.
export async function saveAccountTheme(
  db: Db,
  userId: string,
  account: AccountTheme,
) {
  await db
    .update(users)
    .set({
      themeChoice: account.choice,
      themeCode: account.code,
      themeLight: account.light,
      themeDark: account.dark,
    })
    .where(eq(users.id, userId));
}
