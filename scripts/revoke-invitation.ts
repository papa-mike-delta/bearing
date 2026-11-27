import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
async function main() {
  loadEnvConfig(process.cwd());
  const target = process.argv[2]?.trim();
  if (!target) {
    console.error("Usage: npm run db:revoke-invitation -- <email-or-id>");
    process.exitCode = 1;
    return;
  }
  const db = new PrismaClient();
  try {
    const value = target.toLowerCase();
    const where = value.includes("@")
      ? { email: value, consumedAt: null }
      : { id: target, consumedAt: null };
    const result = await db.invitation.deleteMany({ where });
    if (!result.count) {
      console.error("No open invitation matched.");
      process.exitCode = 1;
      return;
    }
    console.log(`Revoked ${result.count} open invitation(s).`);
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error("Could not revoke the invitation. Check the database configuration.");
  process.exitCode = 1;
});
