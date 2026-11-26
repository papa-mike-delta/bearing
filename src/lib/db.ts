import { PrismaClient } from "@prisma/client";

// One client for identity (Account -> "User"), theme (Setting), audit
// (Ledger -> "OperationLedger") and the V1* product tables.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
