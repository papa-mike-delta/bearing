import { db as defaultDb, sessions, users } from "@repo/db";
import { and, eq, ne } from "drizzle-orm";
import {
  hashPassword,
  minPasswordLength,
  verifyPassword,
} from "./credentials.ts";

// The handle tests pass in. The app uses its own pool.
type PasswordDb = Pick<
  typeof defaultDb,
  "select" | "update" | "delete" | "transaction"
>;

export type PasswordChange =
  | { ok: true }
  | { ok: false; error: "wrong-password" | "invalid" | "mismatch" };

// Same rule as sign-up: at least minPasswordLength characters, and the
// confirmation has to match. A wrong current password changes nothing.
// Other sessions for the account are deleted; keepSession stays signed in.
export async function changePassword(
  userId: string,
  input: { current?: unknown; next?: unknown; confirm?: unknown },
  options: { db?: PasswordDb; keepSession?: string | null } = {},
): Promise<PasswordChange> {
  const next = input.next;
  const confirm = input.confirm;
  const current = input.current;
  if (
    typeof current !== "string" ||
    typeof next !== "string" ||
    typeof confirm !== "string" ||
    next.length < minPasswordLength
  ) {
    return { ok: false, error: "invalid" };
  }
  if (next !== confirm) return { ok: false, error: "mismatch" };

  const db = options.db ?? defaultDb;
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId));
  if (!user || !(await verifyPassword(current, user.passwordHash))) {
    return { ok: false, error: "wrong-password" };
  }

  const passwordHash = await hashPassword(next);
  const keep = options.keepSession;
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await tx
      .delete(sessions)
      .where(
        keep
          ? and(eq(sessions.userId, userId), ne(sessions.sessionToken, keep))
          : eq(sessions.userId, userId),
      );
  });
  return { ok: true };
}

export type PasswordReset =
  { ok: true } | { ok: false; error: "unknown" | "invalid" };

// What the terminal reset does with a typed line. Blank means use the
// generated password; a short one is refused, same as sign-up.
export function chooseResetPassword(entered: string, generated: string) {
  const typed = entered.trim();
  if (!typed) {
    return generated.length < minPasswordLength
      ? ({ error: "invalid" } as const)
      : ({ password: generated, generated: true } as const);
  }
  if (typed.length < minPasswordLength) return { error: "invalid" } as const;
  return { password: typed, generated: false } as const;
}

// Direct connection first. The pooled URL is only a fallback, and this never
// logs what it returns.
export function databaseUrl(env: Record<string, string | undefined>) {
  const direct = env.POSTGRES_URL_NON_POOLING?.trim();
  if (direct) return direct;
  const pooled = env.POSTGRES_URL?.trim();
  return pooled || null;
}

// Sets a new password for an email and signs every session out. Email is
// matched the same way sign-in matches it.
export async function resetPassword(
  email: string,
  password: string,
  db: PasswordDb,
): Promise<PasswordReset> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@") || password.length < minPasswordLength) {
    return { ok: false, error: "invalid" };
  }
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized));
  if (!user) return { ok: false, error: "unknown" };
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
  });
  return { ok: true };
}
