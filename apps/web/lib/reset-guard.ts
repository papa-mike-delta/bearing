// Decides which database the terminal password reset may touch. Pure, so the
// rules are unit-tested; scripts/reset-password.ts does the I/O. Hosts compare
// the way migrate-guard compares them: no pooler suffix, port or case.

import { bareHost, dbHost } from "@repo/db/migrate-guard";

type Env = Partial<Record<string, string>>;

export type ResetTarget =
  | { action: "refuse"; reason: string }
  | {
      action: "reset";
      url: string;
      host: string;
      // The host is PRODUCTION_DB_HOST, and --production allowed it.
      production: boolean;
      warning?: string;
    };

// Direct connection first. The pooled URL is only a fallback, and this never
// logs what it returns.
export function databaseUrl(env: Env) {
  const direct = env.POSTGRES_URL_NON_POOLING?.trim();
  if (direct) return direct;
  const pooled = env.POSTGRES_URL?.trim();
  return pooled || null;
}

export function resetTarget(
  env: Env,
  { production }: { production: boolean },
): ResetTarget {
  const url = databaseUrl(env);
  if (!url) {
    return {
      action: "refuse",
      reason: "Set POSTGRES_URL_NON_POOLING, or POSTGRES_URL.",
    };
  }
  let host: string;
  try {
    const parsed = new URL(url);
    if (!/^postgres(ql)?:$/.test(parsed.protocol) || !parsed.hostname) {
      throw new Error();
    }
    host = dbHost(parsed.hostname);
  } catch {
    return {
      action: "refuse",
      reason: "The database URL is not a valid postgres:// URL with a host.",
    };
  }

  const productionHost = env.PRODUCTION_DB_HOST?.trim();
  if (!productionHost) {
    return {
      action: "reset",
      url,
      host,
      production: false,
      warning:
        "PRODUCTION_DB_HOST is not set, so this can't check whether it's the production database.",
    };
  }
  if (!bareHost.test(productionHost)) {
    return {
      action: "refuse",
      reason:
        "PRODUCTION_DB_HOST is not a bare hostname. Set it to just the host of production's POSTGRES_URL_NON_POOLING, e.g. ep-xxxx-xxxx.us-east-2.aws.neon.tech.",
    };
  }
  const isProduction = dbHost(productionHost) === host;
  if (isProduction && !production) {
    return {
      action: "refuse",
      reason: `${host} is the production database (PRODUCTION_DB_HOST). To reset a production account, run it again with --production: npm run reset-password -w web -- --production <email>`,
    };
  }
  return { action: "reset", url, host, production: isProduction };
}
