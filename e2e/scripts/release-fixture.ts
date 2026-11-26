import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
async function main() {
  // Explicit disposable database only. Never included in application startup/build.
  const url = process.env.TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      "TEST_DATABASE_URL must point to a disposable release-test database",
    );
  process.env.DATABASE_URL = url;
  for (const schema of ["prisma/schema.prisma"])
    execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        schema,
      ],
      { env: process.env, stdio: "inherit" },
    );
  const db = new PrismaClient();
  try {
    // These credentials belong only to this disposable browser fixture.
    await db.account.upsert({
      where: { email: "demo@gmail.com" },
      update: {},
      create: {
        email: "demo@gmail.com",
        passwordHash: await bcrypt.hash("Password123", 12),
        name: "Release fixture",
      },
    });
  } finally {
    await db.$disconnect();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
