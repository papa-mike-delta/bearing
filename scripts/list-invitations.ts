import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
async function main() {
  loadEnvConfig(process.cwd());
  const db = new PrismaClient();
  try {
    const rows = await db.invitation.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        consumedAt: true,
        createdAt: true,
      },
    });
    for (const row of rows) {
      const state = row.consumedAt
        ? "consumed"
        : row.expiresAt < new Date()
          ? "expired"
          : "open";
      console.log(
        `${row.id}\t${row.email}\t${state}\texpires ${row.expiresAt.toISOString()}`,
      );
    }
    if (!rows.length) console.log("No invitations.");
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error("Could not list invitations. Check the database configuration.");
  process.exitCode = 1;
});
