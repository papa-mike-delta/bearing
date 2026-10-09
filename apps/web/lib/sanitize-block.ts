// Stored and expanded theme variable blocks. Only custom properties.

export const maxStoredThemeLength = 8192;

const name = /^--[a-z0-9-]+$/i;
const value = /^[a-z0-9.%()/,+\s-]+$/i;

export function sanitizeBlock(body: string | null | undefined) {
  if (!body || body.length > maxStoredThemeLength) return null;
  if (/[{}<>]|url\s*\(|expression\s*\(|@import|<\/|["'`\\]/i.test(body)) {
    return null;
  }
  const decls = body
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  if (decls.length === 0) return null;
  const out: string[] = [];
  for (const decl of decls) {
    const splitAt = decl.indexOf(":");
    if (splitAt === -1) return null;
    const property = decl.slice(0, splitAt).trim();
    const propertyValue = decl.slice(splitAt + 1).trim();
    if (!name.test(property) || !value.test(propertyValue)) return null;
    out.push(`${property}: ${propertyValue}`);
  }
  return `${out.join("; ")};`;
}
