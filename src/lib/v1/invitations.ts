import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { invitationInput } from "./contracts";
import { parse, Fault } from "./service";
export class Invitations {
  static list() {
    return db.invitation.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        consumedAt: true,
        createdAt: true,
      },
    });
  }
  static async revoke(target: string) {
    const value = target.trim().toLowerCase();
    const where = value.includes("@")
      ? { email: value, consumedAt: null }
      : { id: target.trim(), consumedAt: null };
    const result = await db.invitation.deleteMany({ where });
    if (!result.count) throw new Fault(404, "No open invitation matched");
    return { revoked: result.count };
  }
}
export const invitationHash = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");
export async function registerInvited(raw: unknown) {
  const data = parse(invitationInput, raw),
    passwordHash = await bcrypt.hash(data.password, 12);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
    const invitation = await tx.invitation.findFirst({
      where: {
        tokenHash: invitationHash(data.token),
        email: data.email,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!invitation)
      throw new Fault(403, "A valid invitation for this email is required");
    if (await tx.account.findUnique({ where: { email: data.email } }))
      throw new Fault(409, "An account with this email already exists");
    const user = await tx.account.create({
      data: { email: data.email, name: data.name, passwordHash },
    });
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { consumedAt: new Date() },
    });
    // The database trigger creates the canonical Me in this same transaction.
    await tx.ledger.create({
      data: {
        userId: user.id,
        actor: `user:${user.id}`,
        operation: "v1.account.register",
        payload: "{}",
        status: "success",
        receipt: JSON.stringify({ ok: true, value: { id: user.id } }),
      },
    });
    return { id: user.id, email: user.email, name: user.name };
  });
}
