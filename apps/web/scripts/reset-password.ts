// Sets a new password for an account and signs every session out.
//
//   POSTGRES_URL_NON_POOLING=... npm run reset-password -w web -- you@example.com
//
// Prompts for the new password when a terminal is attached. Leave it blank
// and one is generated and printed once. Never prints the connection string.

import { createDb, db } from "@repo/db";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  chooseResetPassword,
  databaseUrl,
  resetPassword,
} from "../lib/password.ts";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run reset-password -w web -- <email>");
  process.exit(1);
}

const url = databaseUrl(process.env);
if (!url) {
  console.error("Set POSTGRES_URL_NON_POOLING, or POSTGRES_URL.");
  process.exit(1);
}

let entered = "";
if (input.isTTY) {
  const rl = createInterface({ input, output });
  entered = await rl.question("New password (leave empty to generate one): ");
  rl.close();
}

const chosen = chooseResetPassword(
  entered,
  randomBytes(18).toString("base64url"),
);
if ("error" in chosen) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const handle = createDb(url);
let failed = false;
try {
  const result = await resetPassword(email, chosen.password, handle);
  if (!result.ok) {
    failed = true;
    console.error(
      result.error === "unknown"
        ? `No account for ${email.trim().toLowerCase()}.`
        : "Password must be at least 8 characters.",
    );
  } else if (chosen.generated) {
    console.log(`Password reset. New password: ${chosen.password}`);
    console.log("Every session for that account was signed out.");
  } else {
    console.log(
      "Password reset. Every session for that account was signed out.",
    );
  }
} catch (error) {
  failed = true;
  console.error("Password reset failed.");
  const message = error instanceof Error ? error.message : "";
  if (
    message &&
    !message.includes(url) &&
    !/postgres(ql)?:\/\//i.test(message)
  ) {
    console.error(message);
  }
} finally {
  await handle.$client.end();
  await db.$client.end();
}

if (failed) process.exit(1);
