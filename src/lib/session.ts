// Database-free signed sessions, shared by the proxy and server handlers.
import crypto from "node:crypto";

export const SESSION_COOKIE = "bearing-session";
const DEV_SESSION_SECRET = "dev-session-secret-change-in-production";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (
    (process.env.NODE_ENV === "production" ||
      process.env.VERCEL_ENV === "production") &&
    (!value || value.length < 32 || value === DEV_SESSION_SECRET)
  )
    throw new Error(
      "Production requires a unique SESSION_SECRET of at least 32 characters",
    );
  return value || DEV_SESSION_SECRET;
}
export interface SessionData {
  userId: string;
  email: string;
  twoFactorVerified: boolean;
  createdAt: number;
  expiresAt: number;
}
export function sessionTokenFromCookie(header: string | null | undefined) {
  if (!header) return "";
  const match = header.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`),
  );
  return match?.[1] ?? "";
}
export function sessionCookie(token: string, maxAge = 604800) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export function createSession(
  userId: string,
  email: string,
  twoFactorVerified: boolean,
): string {
  const createdAt = Date.now();
  const payload = JSON.stringify({
    userId,
    email,
    twoFactorVerified,
    createdAt,
    expiresAt: createdAt + (twoFactorVerified ? 7 * 86400_000 : 600_000),
  } satisfies SessionData);
  return Buffer.from(
    `${payload}.${crypto.createHmac("sha256", secret()).update(payload).digest("hex")}`,
  ).toString("base64url");
}
export function verifySession(token: string): SessionData | null {
  try {
    if (token.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
    const bytes = Buffer.from(token, "base64url");
    if (bytes.toString("base64url") !== token) return null;
    const decoded = bytes.toString(),
      dot = decoded.lastIndexOf(".");
    if (dot === -1) return null;
    const payload = decoded.slice(0, dot),
      signature = decoded.slice(dot + 1);
    if (!/^[a-f0-9]{64}$/.test(signature)) return null;
    const expected = crypto
      .createHmac("sha256", secret())
      .update(payload)
      .digest();
    if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), expected))
      return null;
    const data = JSON.parse(payload) as SessionData;
    if (
      typeof data.userId !== "string" ||
      !data.userId ||
      typeof data.email !== "string" ||
      typeof data.twoFactorVerified !== "boolean" ||
      !Number.isSafeInteger(data.createdAt) ||
      !Number.isSafeInteger(data.expiresAt) ||
      data.createdAt > Date.now() ||
      data.expiresAt <= Date.now() ||
      data.expiresAt <= data.createdAt ||
      data.expiresAt - data.createdAt > 7 * 86400_000
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
