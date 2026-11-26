/** Preserve only local app destinations, never external redirect input. */
export function appDestination(value: string | null | undefined): string {
  if (!value || /[\\\r\n]/.test(value)) return "/app";
  try {
    const url = new URL(value, "https://bearing.invalid");
    if (
      url.origin !== "https://bearing.invalid" ||
      !(url.pathname === "/app" || url.pathname.startsWith("/app/"))
    )
      return "/app";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/app";
  }
}
export function loginDestination(path: string) {
  const next = appDestination(path);
  return next === "/app" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}
