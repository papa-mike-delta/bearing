// Decides whether a migrate run may touch the database it was pointed at.
// Pure, so the rules are unit-tested; migrate.ts does the I/O.

type Env = Partial<Record<string, string>>;

export type Decision =
  | { action: "skip"; reason: string }
  | { action: "refuse"; reason: string }
  | { action: "migrate"; url: string; host: string };

// PRODUCTION_DB_HOST must be a bare hostname, optionally with a port: two or
// more dot-separated labels, no scheme, userinfo, path, quotes, spaces or
// trailing dot. Anything else could never match, so the check would pass.
// The terminal password reset (apps/web) uses the same rule and dbHost.
export const bareHost = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i;

// Neon's pooled and direct hosts differ only by "-pooler" on the endpoint,
// so either form of PRODUCTION_DB_HOST matches.
export function dbHost(hostOrUrl: string) {
  const host = hostOrUrl.includes("://")
    ? new URL(hostOrUrl).hostname
    : hostOrUrl.split(":")[0]!;
  return host.toLowerCase().replace(/^([^.]+)-pooler\./, "$1.");
}

export function decide(env: Env, { vercel }: { vercel: boolean }): Decision {
  if (vercel && env.VERCEL !== "1") {
    if (env.BEARING_VERCEL_BUILD === "1") {
      return {
        action: "refuse",
        reason:
          "VERCEL is not set, so this Vercel build can't tell production from preview. Turn on Settings → Environment Variables → Automatically expose System Environment Variables.",
      };
    }
    return { action: "skip", reason: "not a Vercel build" };
  }
  const vercelEnv = env.VERCEL_ENV;
  if (vercel && vercelEnv === "development") {
    return {
      action: "skip",
      reason: "Vercel development build; run db:migrate by hand",
    };
  }
  if (vercel && vercelEnv !== "production" && vercelEnv !== "preview") {
    return {
      action: "refuse",
      reason: `unknown VERCEL_ENV "${vercelEnv ?? ""}" (expected production or preview)`,
    };
  }
  const url = env.POSTGRES_URL_NON_POOLING;
  if (!url) {
    return {
      action: "refuse",
      reason: vercel
        ? `POSTGRES_URL_NON_POOLING is not set for this ${vercelEnv} build. Connect the Neon integration to this environment (Preview needs preview branching on).`
        : "set POSTGRES_URL_NON_POOLING (the direct, unpooled connection string)",
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
      reason:
        "POSTGRES_URL_NON_POOLING is not a valid postgres:// URL with a host",
    };
  }
  if (vercel && vercelEnv === "preview") {
    const production = env.PRODUCTION_DB_HOST?.trim();
    if (!production) {
      return {
        action: "refuse",
        reason:
          "PRODUCTION_DB_HOST is not set, so this preview can't check that it isn't migrating the production database. Set it in Vercel (Preview environment) to the host of production's POSTGRES_URL_NON_POOLING.",
      };
    }
    if (!bareHost.test(production)) {
      return {
        action: "refuse",
        reason:
          "PRODUCTION_DB_HOST is not a bare hostname. Set it to just the host of production's POSTGRES_URL_NON_POOLING, e.g. ep-xxxx-xxxx.us-east-2.aws.neon.tech: the full host, not only the endpoint id, with no scheme, user, password, path, quotes, spaces or trailing dot.",
      };
    }
    if (dbHost(production) === host) {
      return {
        action: "refuse",
        reason: `this preview build points at the production database (${host}). Turn on Neon preview branching so previews get their own branch.`,
      };
    }
  }
  return { action: "migrate", url, host };
}
