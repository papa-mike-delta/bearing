import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// OWASP's scrypt minimum. The parameters are stored with each hash as
// scrypt$N$r$p$salt$key, so they can be raised later.
const cost = { N: 2 ** 17, r: 8, p: 1 };
const saltBytes = 16;
const keyBytes = 64;

function derive(password: string, salt: Buffer, params: typeof cost) {
  const maxmem = 256 * params.N * params.r; // scrypt needs ~128 * N * r bytes
  return scryptAsync(password, salt, keyBytes, { ...params, maxmem });
}

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
  const salt = randomBytes(saltBytes);
  const key = await derive(password, salt, cost);
  const { N, r, p } = cost;
  return ["scrypt", N, r, p, salt.toString("hex"), key.toString("hex")].join(
    "$",
  );
}

// Reads the parameters back from the hash. Hashes from before the format
// change are salt:key at Node's default cost (N=2^14, r=8, p=1).
function parseHash(stored: string) {
  let salt, key;
  let params = { N: 2 ** 14, r: 8, p: 1 };
  const parts = stored.split("$");
  if (parts[0] === "scrypt" && parts.length === 6) {
    const [, N, r, p] = parts.map(Number);
    params = { N: N!, r: r!, p: p! };
    [salt, key] = parts.slice(4);
  } else {
    [salt, key] = stored.split(":");
  }
  const saltBuf = Buffer.from(salt ?? "", "hex");
  const keyBuf = Buffer.from(key ?? "", "hex");
  // A malformed hash must never verify (an empty key would match anything).
  if (saltBuf.length !== saltBytes || keyBuf.length !== keyBytes) return null;
  const { N, r, p } = params;
  const sane =
    Number.isInteger(Math.log2(N)) &&
    N >= 2 ** 14 &&
    N <= 2 ** 20 &&
    r >= 1 &&
    r <= 32 &&
    p >= 1 &&
    p <= 16;
  return sane ? { salt: saltBuf, key: keyBuf, params } : null;
}

export async function verifyPassword(password: string, stored: string) {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const actual = await derive(password, parsed.salt, parsed.params);
  return timingSafeEqual(actual, parsed.key);
}
