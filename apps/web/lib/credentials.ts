import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const minPasswordLength = 8;

// Email is matched case-insensitively. Returns null when the input cannot be an account.
export function parseCredentials(input: Partial<Record<string, unknown>>) {
  const { email, password } = input;
  if (typeof email !== "string" || typeof password !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@") || password.length < minPasswordLength) {
    return null;
  }
  return { email: normalized, password };
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  const actual = await scryptAsync(
    password,
    Buffer.from(salt, "hex"),
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}
