import { z } from "zod";
import { itemInput } from "../contracts";
import { validLinkEndpoints } from "../link-policy";
import { db } from "@/lib/db";
import {
  Fault,
  owned,
  parse,
  write,
  type Principal,
  type Tx,
} from "../service";
import type { Plan } from "./contracts";
import { trustPatternIds, type TrustPatternId } from "./trust-catalog";

const policyValue = z.strictObject({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  patterns: z.array(z.enum(trustPatternIds)).max(trustPatternIds.length),
});
const saveInput = z.strictObject({
  revision: z.number().int().nonnegative(),
  patterns: z.array(z.enum(trustPatternIds)).max(trustPatternIds.length),
});
export type TrustPolicy = {
  version: 1;
  revision: number;
  patterns: TrustPatternId[];
};
type Prefs = Tx | typeof db;
const EMPTY: TrustPolicy = { version: 1, revision: 0, patterns: [] };
const OPEN = new Set(["inbox", "todo"]);

function unique(patterns: readonly TrustPatternId[]) {
  return [...new Set(patterns)].sort() as TrustPatternId[];
}
function openItem(data: unknown, types: readonly string[]) {
  const parsed = itemInput.safeParse(data);
  if (!parsed.success) return false;
  const item = parsed.data;
  return (
    types.includes(item.type) &&
    OPEN.has(item.status) &&
    item.delegateId == null &&
    (item.projectId == null || !item.projectId.startsWith("new_")) &&
    item.tagIds.every((id) => !id.startsWith("new_"))
  );
}

export class CoachTrust {
  static key = "coach.trust";
  /** Restore may keep every other preference. Grants and unspent settle markers stay off. */
  static restorable(key: string) {
    return key !== CoachTrust.key && !key.startsWith("coach.arm.");
  }
  static async read(client: Prefs, userId: string): Promise<TrustPolicy> {
    const row = await client.preference.findUnique({
      where: { userId_key: { userId, key: CoachTrust.key } },
    });
    const parsed = policyValue.safeParse(row?.value);
    if (!parsed.success) return EMPTY;
    return {
      version: 1,
      revision: parsed.data.revision,
      patterns: unique(parsed.data.patterns),
    };
  }
  static save(p: Principal, raw: unknown) {
    return write(p, "v1.coach.trust", raw, async (tx) => {
      const input = parse(saveInput, raw);
      const current = await CoachTrust.read(tx, p.userId);
      if (input.revision !== current.revision)
        throw new Fault(409, "Trust settings changed. Reload before saving.");
      const next: TrustPolicy = {
        version: 1,
        revision: current.revision + 1,
        patterns: unique(input.patterns),
      };
      await tx.preference.upsert({
        where: { userId_key: { userId: p.userId, key: CoachTrust.key } },
        create: { userId: p.userId, key: CoachTrust.key, value: next },
        update: { value: next },
      });
      return next;
    });
  }
  /** Normalized single-operation shape. Endpoint legality is checked in decide. */
  static patternFor(plan: Plan): TrustPatternId | null {
    if (plan.version !== 1 || plan.destructive || plan.operations.length !== 1)
      return null;
    const op = plan.operations[0];
    if (
      op.op === "organize_moment" &&
      openItem(op.data, ["task", "note"])
    )
      return "file_raw_moment";
    if (op.op === "create_item" && openItem(op.data, ["task"]))
      return "create_open_task";
    if (
      op.op === "link" &&
      op.fromId !== op.toId &&
      !op.fromId.startsWith("new_") &&
      !op.toId.startsWith("new_")
    )
      return "link_existing";
    return null;
  }
  static async decide(client: Prefs, userId: string, plan: Plan) {
    const policy = await CoachTrust.read(client, userId);
    const patternId = CoachTrust.patternFor(plan);
    if (!patternId || !policy.patterns.includes(patternId)) return null;
    if (patternId === "link_existing") {
      const op = plan.operations[0];
      if (op.op !== "link") return null;
      try {
        const from = await owned(client as Tx, userId, "item", op.fromId);
        const to = await owned(client as Tx, userId, "item", op.toId);
        if (!validLinkEndpoints(op.type, from, to)) return null;
      } catch (error) {
        if (error instanceof Fault && error.status === 404) return null;
        throw error;
      }
    }
    return { patternId, policyRevision: policy.revision };
  }
  static async disarm(userId: string, nonce: string | undefined) {
    if (!nonce) return;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
      await tx.preference.deleteMany({
        where: { userId, key: `coach.arm.${nonce}` },
      });
    });
  }
}
