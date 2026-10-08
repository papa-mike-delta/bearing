// Fails a Vercel production or preview build that didn't apply migrations
// first. @repo/db's `migrate.ts --vercel` writes the marker after migrating;
// a build command that skips it (say, a bare `next build`) gets no marker.
// Local, CI and Vercel development builds are not checked.

export const markerUrl = new URL(
  "../../packages/db/.migrate-marker.json",
  import.meta.url,
);

/**
 * @param {Partial<Record<string, string>>} env
 * @param {() => string} readMarker
 */
export function assertMigrated(env, readMarker) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV === "development") return;
  let marker = null;
  try {
    marker = JSON.parse(readMarker());
  } catch {
    // missing or unreadable: treated as not migrated
  }
  const thisBuild = env.VERCEL_DEPLOYMENT_ID ?? env.VERCEL_GIT_COMMIT_SHA;
  const ran =
    marker !== null &&
    marker.env === env.VERCEL_ENV &&
    (marker.deploymentId ?? marker.commit) === thisBuild;
  if (!ran) {
    throw new Error(
      `This ${env.VERCEL_ENV} build did not apply database migrations first. ` +
        "The build command must be the one in apps/web/vercel.json " +
        "(turbo runs @repo/db#db:migrate:vercel before next build).",
    );
  }
}
