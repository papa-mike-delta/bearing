import crypto from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
async function main() {
  loadEnvConfig(process.cwd());
  const email = z.email().parse(process.argv[2]).toLowerCase();
  const token = crypto.randomBytes(32).toString("hex");
  const db = new PrismaClient();
  try {
    await db.invitation.create({
      data: {
        email,
        tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 7 * 86400_000),
      },
    });
    console.log(`Invitation for ${email} (expires in 7 days): ${token}`);
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    "Invitation creation failed. Check the email, database configuration and applied migrations.",
  );
  process.exitCode = 1;
});
