import { db } from "@/lib/db";
import { ok, bad, parseBody, getUserFromRequest } from "@/lib/auth-utils";
import { ThemeOverride } from "@/lib/theme-override";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getUserFromRequest(req);
  if (!session) return bad("Unauthorized", 401);
  const expected = req.headers.get("X-Bearing-Account");
  if (expected && expected !== session.userId) return bad("Account changed; reload to confirm your account", 409);

  const setting = await db.setting.findFirst({ where: { id: `theme-${session.userId}`, userId: session.userId } });
  try {
    return ok({ css: setting ? ThemeOverride.serialize(JSON.parse(setting.value)) : "" });
  } catch {
    return bad("Stored theme is invalid. Import a new theme or reset it.");
  }
}

export async function POST(req: Request) {
  const session = await getUserFromRequest(req);
  if (!session) return bad("Unauthorized", 401);
  const expected = req.headers.get("X-Bearing-Account");
  if (expected && expected !== session.userId) return bad("Account changed; reload to confirm your account", 409);

  const body = await parseBody<{ input?: unknown } | null>(req);
  if (typeof body?.input !== "string") return bad("Provide a theme URL, CSS, or JSON.");

  let theme;
  let css: string;
  try {
    theme = await ThemeOverride.parse(body.input);
    css = ThemeOverride.serialize(theme);
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Unable to import theme.");
  }

  const id = `theme-${session.userId}`;
  const value = JSON.stringify(theme);
  await db.setting.upsert({
    where: { id },
    update: { value, userId: session.userId },
    create: { id, value, userId: session.userId },
  });
  return ok({ css });
}

export async function DELETE(req: Request) {
  const session = await getUserFromRequest(req);
  if (!session) return bad("Unauthorized", 401);
  const expected = req.headers.get("X-Bearing-Account");
  if (expected && expected !== session.userId) return bad("Account changed; reload to confirm your account", 409);

  await db.setting.deleteMany({ where: { id: `theme-${session.userId}`, userId: session.userId } });
  return ok({ css: "" });
}
