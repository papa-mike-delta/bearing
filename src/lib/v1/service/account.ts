import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { deleteAccountConfirmation } from "../contracts";
import { clearData } from "./backup";
import {
  Fault,
  guardOpen,
  parse,
  write,
  type Principal,
  type Tx,
} from "./index";

const identifiedBy: Record<string, "userId" | "id" | "email"> = {
  User: "id",
  V1Invitation: "email",
};

/** Every account-owned table. A new model fails deletion until it is added here and removed below. */
export class V1Account {
  static readonly tables = [
    "OperationLedger",
    "Setting",
    "User",
    "V1Activity",
    "V1Conversation",
    "V1Invitation",
    "V1Item",
    "V1ItemTag",
    "V1JournalMoment",
    "V1Lease",
    "V1Link",
    "V1Message",
    "V1MomentItem",
    "V1Preference",
    "V1Project",
    "V1ProjectTag",
    "V1Proposal",
    "V1Recurrence",
    "V1Review",
    "V1ReviewItem",
    "V1SelfProfile",
    "V1Tag",
    "V1TaskOccurrence",
  ] as const;

  static delete(p: Principal, raw: unknown) {
    return write(
      p,
      "v1.account.delete",
      { id: p.userId, revision: 0 },
      async (tx) => {
        const input = parse(
          z.strictObject({
            password: z.string().min(1).max(200),
            confirmation: z.string().max(200),
          }),
          raw,
        );
        if (
          input.confirmation !== deleteAccountConfirmation ||
          p.actor !== `user:${p.userId}`
        )
          throw new Fault(403, "Explicit user confirmation required");
        const account = await tx.account.findUnique({
          where: { id: p.userId },
        });
        if (
          !account ||
          !(await bcrypt.compare(input.password, account.passwordHash))
        )
          throw new Fault(403, "Password does not match");
        await guardOpen(tx, p);
        await clearData(tx, p.userId);
        return { id: p.userId, revision: 0 };
      },
      undefined,
      (tx) => V1Account.erase(tx, p.userId),
    );
  }

  /** Removes identity rows left by reset, including the receipt just written for this deletion. */
  static async erase(tx: Tx, userId: string) {
    await tx.$executeRaw`SELECT set_config('bearing.deleting_account', ${userId}, true)`;
    const account = await tx.account.findUnique({ where: { id: userId } });
    if (!account) throw new Fault(404, "Not found");
    await tx.selfProfile.deleteMany({ where: { userId } });
    await tx.lease.deleteMany({ where: { userId } });
    await tx.item.updateMany({
      where: { userId },
      data: { delegateId: null, projectId: null },
    });
    await tx.item.deleteMany({ where: { userId } });
    await tx.setting.deleteMany({ where: { userId } });
    await tx.$executeRaw`DELETE FROM "V1Invitation" WHERE lower("email") = lower(${account.email})`;
    await tx.ledger.deleteMany({ where: { userId } });
    await tx.account.delete({ where: { id: userId } });
    await V1Account.assertGone(tx, userId, account.email);
  }

  static async assertGone(tx: Tx, userId: string, email: string) {
    const found = await tx.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
    `;
    const actual = found.map((row) => row.table_name).sort();
    const expected: string[] = [...V1Account.tables].sort();
    if (actual.join("\n") !== expected.join("\n"))
      throw new Fault(500, "Account deletion does not cover every table", {
        unexpected: actual.filter((name) => !expected.includes(name)),
        missing: expected.filter((name) => !actual.includes(name)),
      });
    for (const table of expected) {
      const column = identifiedBy[table] ?? "userId";
      const columns = await tx.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = ${table}
      `;
      if (!columns.some((row) => row.column_name === column))
        throw new Fault(
          500,
          "Account deletion does not know how to match this table",
          { table },
        );
      if ((await V1Account.ownedCount(tx, table, column, userId, email)) > 0)
        throw new Fault(500, "Account deletion left owned rows", { table });
    }
  }

  private static async ownedCount(
    tx: Tx,
    table: string,
    column: "userId" | "id" | "email",
    userId: string,
    email: string,
  ) {
    if (!/^[A-Za-z0-9_]+$/.test(table))
      throw new Fault(500, "Unexpected table name");
    const rows =
      column === "email"
        ? await tx.$queryRaw<{ n: number }[]>`
            SELECT count(*)::int AS n FROM "V1Invitation"
            WHERE lower("email") = lower(${email})
          `
        : await tx.$queryRaw<{ n: number }[]>(
            Prisma.sql`SELECT count(*)::int AS n FROM ${Prisma.raw(`"${table}"`)} WHERE ${Prisma.raw(`"${column}"`)} = ${userId}`,
          );
    return Number(rows[0]?.n ?? 0);
  }
}
