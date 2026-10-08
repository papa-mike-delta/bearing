// Sets a new password for an account and signs every session out.
//
//   POSTGRES_URL_NON_POOLING=... npm run reset-password -w web -- --no-prod-check you@example.com
//
// PRODUCTION_DB_HOST is required unless --no-prod-check is passed for a
// database that is definitely not production. Refuses the production database
// (the host in PRODUCTION_DB_HOST) unless --production is passed. Shows the
// target host/db, asks for the email again, then asks for the new password
// twice without echoing it. Leave it blank and one is generated and printed
// once. Never prints the connection string.

import { createDb, db } from "@repo/db";
import { randomBytes } from "node:crypto";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { minPasswordLength } from "../lib/credentials.ts";
import { readHidden } from "../lib/hidden-input.ts";
import { chooseResetPassword, resetPassword } from "../lib/password.ts";
import { resetTarget } from "../lib/reset-guard.ts";

const usage =
  "Usage: npm run reset-password -w web -- [--production] [--no-prod-check] <email>";

let args;
try {
  args = parseArgs({
    options: {
      production: { type: "boolean", default: false },
      "no-prod-check": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage);
  process.exit(1);
}
const email = args.positionals[0]?.trim().toLowerCase();
if (!email || args.positionals.length > 1) {
  console.error(usage);
  process.exit(1);
}

const target = resetTarget(process.env, {
  production: args.values.production,
  noProdCheck: args.values["no-prod-check"],
});
if (target.action === "refuse") {
  console.error(`Refused: ${target.reason}`);
  process.exit(1);
}
if (target.warning) console.warn(`Warning: ${target.warning}`);

if (!input.isTTY) {
  console.error(
    "Run this from a terminal. It asks you to confirm the email and the password.",
  );
  process.exit(1);
}

const { url, host } = target;
console.log(
  `Target: ${host}${new URL(url).pathname}${target.production ? " (production)" : ""}`,
);

let password: string;
let generated: boolean;
try {
  const rl = createInterface({ input, output });
  const again = await rl.question(`Type ${email} again to confirm: `);
  rl.close();
  if (again.trim().toLowerCase() !== email) {
    console.error("That email doesn't match. Nothing was changed.");
    process.exit(1);
  }

  const entered = await readHidden(
    "New password (leave empty to generate one): ",
    { input, output },
  );
  const confirm = entered.trim()
    ? await readHidden("Type the new password again: ", { input, output })
    : "";
  const chosen = chooseResetPassword(
    entered,
    confirm,
    randomBytes(18).toString("base64url"),
  );
  if ("error" in chosen) {
    console.error(
      chosen.error === "mismatch"
        ? "The passwords don't match. Nothing was changed."
        : `Password must be at least ${minPasswordLength} characters. Nothing was changed.`,
    );
    process.exit(1);
  }
  ({ password, generated } = chosen);
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    console.error("Cancelled. Nothing was changed.");
    process.exit(130);
  }
  throw error;
}

const handle = createDb(url);
let failed = false;
try {
  const result = await resetPassword(email, password, handle);
  if (!result.ok) {
    failed = true;
    console.error(
      result.error === "unknown"
        ? `No account for ${email}.`
        : `That isn't a valid email, or the password is shorter than ${minPasswordLength} characters.`,
    );
  } else if (generated) {
    console.log(`Password reset. New password: ${password}`);
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
