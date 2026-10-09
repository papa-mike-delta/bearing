import { users } from "@repo/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { cache } from "react";
import {
  defaultAccountTheme,
  isBuiltInThemeId,
  type AccountTheme,
} from "./account-theme.ts";
import type { Db } from "./db.ts";

// The theme stored for one Account, or the shared default when that user has
// no row. One lookup per request, shared by the layout and the account page.
export const loadAccountTheme = cache(
  async function loadAccountTheme(
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
  },
);

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

// Writes only theme_choice. An import's code and variables stay on the row.
// A known built-in id, or "imported" when the row already has a code.
// Anything else leaves the row as it was.
export async function switchAccountTheme(
  db: Db,
  userId: string,
  choice: string,
) {
  if (isBuiltInThemeId(choice)) {
    await db
      .update(users)
      .set({ themeChoice: choice })
      .where(eq(users.id, userId));
    return { error: null };
  }
  if (choice === "imported") {
    const [row] = await db
      .update(users)
      .set({ themeChoice: "imported" })
      .where(and(eq(users.id, userId), isNotNull(users.themeCode)))
      .returning({ id: users.id });
    if (!row) return { error: "rejected" as const };
    return { error: null };
  }
  return { error: "rejected" as const };
}
