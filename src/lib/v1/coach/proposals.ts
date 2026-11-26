import crypto from "node:crypto";
import { z } from "zod";
import {
  V1,
  write,
  owned,
  parse,
  Fault,
  TrustDeclined,
  guardOpen,
  type Principal,
  type Tx,
} from "../service";
import { CoachTrust } from "./trust";
import { db } from "@/lib/db";
import { itemInput, projectInput } from "../contracts";
import { itemDto } from "../client-model";
import { canonicalJson } from "../json";
import {
  operationsInput,
  type Plan,
  type Draft,
  type Operation,
} from "./contracts";
const envelope = z.object({
  userId: z.string(),
  expires: z.number(),
  nonce: z.string(),
  plan: z.unknown(),
  proposalId: z.string().optional(),
  revision: z.number().optional(),
  settleNonce: z.string().optional(),
});
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32)
    throw new Fault(503, "Coach approval signing is not configured");
  return value;
}
function sign(value: unknown) {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", secret()).update(body).digest("base64url")}`;
}
function verify(token: string, userId: string) {
  const [body, mac, ...extra] = token.split(".");
  if (!body || !mac || extra.length) throw new Fault(400, "Invalid proposal");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest();
  const supplied = Buffer.from(mac, "base64url");
  if (
    expected.length !== supplied.length ||
    !crypto.timingSafeEqual(expected, supplied)
  )
    throw new Fault(400, "Invalid proposal");
  let raw;
  try {
    raw = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    throw new Fault(400, "Invalid proposal");
  }
  const value = parse(envelope, raw);
  if (value.userId !== userId) throw new Fault(404, "Not found");
  if (value.expires < Date.now())
    throw new Fault(409, "Proposal expired. Review a fresh preview.");
  return { ...value, plan: value.plan as Plan };
}
async function itemData(tx: Tx, userId: string, id: string) {
  const row = await owned(tx, userId, "item", id);
  const tags = await tx.itemTag.findMany({ where: { userId, itemId: id } });
  return {
    row,
    data: parse(
      itemInput,
      itemDto({
        ...JSON.parse(JSON.stringify(row)),
        tagIds: tags.map((t) => t.tagId),
      }),
    ),
  };
}
export async function preparePlan(
  userId: string,
  raw: unknown,
  tx: Tx,
): Promise<Plan> {
  const operations = parse(operationsInput, raw);
  const aliases = new Map<string, string>();
  const previews: Plan["previews"] = [];
  for (const op of operations) {
    if ("key" in op) {
      if (!op.key.startsWith("new_") || aliases.has(op.key))
        throw new Fault(
          400,
          "New record keys must be unique and start with new_",
        );
      const collision =
        (await tx.item.count({ where: { userId, id: op.key } })) +
        (await tx.project.count({ where: { userId, id: op.key } })) +
        (await tx.tag.count({ where: { userId, id: op.key } }));
      if (collision)
        throw new Fault(400, "New key collides with an existing record");
      aliases.set(
        op.key,
        op.op === "create_item" || op.op === "organize_moment"
          ? op.data.type
          : op.op === "create_project"
            ? "project"
            : "tag",
      );
    }
  }
  const validateRef = async (
    value: string | null | undefined,
    kind: "item" | "project" | "tag",
  ) => {
    if (!value) return;
    if (aliases.has(value)) {
      const type = aliases.get(value)!;
      if (
        (kind === "item" && ["project", "tag"].includes(type)) ||
        (kind !== "item" && type !== kind)
      )
        throw new Fault(400, "New reference has the wrong kind");
      return;
    }
    if (kind === "tag") {
      if (!(await tx.tag.findFirst({ where: { userId, id: value } })))
        throw new Fault(404, "Not found");
    } else await owned(tx, userId, kind, value);
  };
  let destructive = false;
  for (const op of operations) {
    if (op.op === "organize_moment") {
      const row = await owned(tx, userId, "journalMoment", op.id);
      if (row.revision !== op.revision)
        throw new Fault(409, "Journal entry changed", {
          currentRevision: row.revision,
        });
      if (
        await tx.momentItem.count({
          where: { userId, momentId: op.id, relation: "reference" },
        })
      )
        throw new Fault(
          400,
          "This entry already references an Item; edit that canonical Item instead",
        );
      previews.push({
        label: "Organize Journal entry",
        before: {
          text: (row as any).text,
          occurredAt: (row as any).occurredAt,
        },
        after: { ...op.data, resolvesJournalEntry: true },
      });
    } else if (op.op === "update_item" || op.op === "archive_item") {
      const { row, data } = await itemData(tx, userId, op.id);
      if (row.revision !== op.revision)
        throw new Fault(409, "Item changed", { currentRevision: row.revision });
      const next = parse(
        itemInput,
        op.op === "archive_item"
          ? { ...data, status: "archived" }
          : { ...data, ...op.data },
      );
      if (op.op === "update_item") op.data = next;
      destructive ||= next.status === "archived" || next.type !== data.type;
      previews.push({
        label: `${op.op === "archive_item" ? "Archive" : "Edit"} ${row.title}`,
        before: data,
        after: next,
      });
    } else if (op.op === "update_project") {
      const row = await owned(tx, userId, "project", op.id);
      if (row.revision !== op.revision)
        throw new Fault(409, "Project changed", {
          currentRevision: row.revision,
        });
      previews.push({
        label: `Edit Project ${(row as any).name}`,
        before: row,
        after: op.data,
      });
      destructive ||= op.data.status === "archived";
    } else if (op.op === "unlink") {
      const row = await tx.link.findFirst({ where: { userId, id: op.id } });
      if (!row) throw new Fault(404, "Not found");
      previews.push({ label: "Remove connection", before: row, after: null });
      destructive = true;
    } else
      previews.push({
        label: op.op.replaceAll("_", " "),
        before: null,
        after: "data" in op ? op.data : op,
      });
    if ("data" in op) {
      const data = op.data as any;
      if (data.projectId) await validateRef(data.projectId, "project");
      if (data.delegateId) await validateRef(data.delegateId, "item");
      for (const tag of data.tagIds || []) await validateRef(tag, "tag");
    }
    if (op.op === "link") {
      await validateRef(op.fromId, "item");
      await validateRef(op.toId, "item");
    }
  }
  const plan: Plan = { version: 1, operations, previews, destructive };
  if (Buffer.byteLength(JSON.stringify(plan)) > 250000)
    throw new Fault(
      413,
      "Proposal is too large; use the Item editor for long content",
    );
  return plan;
}
async function clearArms(tx: Tx, userId: string, proposalId: string) {
  await tx.preference.deleteMany({
    where: {
      userId,
      key: { startsWith: "coach.arm." },
      value: { path: ["proposalId"], equals: proposalId },
    },
  });
}
export async function preview(
  userId: string,
  raw: unknown,
  context: {
    conversationId?: string;
    id?: string;
    revision?: number;
    draftKey?: string;
    /** Server-only. HTTP preview never sets this. */
    arm?: boolean;
  } = {},
): Promise<Draft> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
    if (context.conversationId)
      await owned(tx, userId, "conversation", context.conversationId);
    const plan = await preparePlan(userId, raw, tx);
    let record;
    let fresh = false;
    if (context.id) {
      record = await tx.proposal.findFirst({
        where: { userId, id: context.id },
      });
      if (!record) throw new Fault(404, "Not found");
      if (record.status !== "pending" || record.revision !== context.revision)
        throw new Fault(409, "Proposal changed. Reload the conversation.");
      await clearArms(tx, userId, record.id);
      record = await tx.proposal.update({
        where: { id: record.id },
        data: {
          operations: JSON.parse(JSON.stringify(plan)),
          revision: { increment: 1 },
        },
      });
    } else if (context.conversationId) {
      const stableId = context.draftKey
        ? `coach_${crypto
            .createHash("sha256")
            .update(userId + ":" + context.draftKey)
            .digest("hex")
            .slice(0, 32)}`
        : undefined;
      if (stableId)
        record = await tx.proposal.findFirst({
          where: { userId, id: stableId },
        });
      if (record) {
        if (
          record.status !== "pending" ||
          canonicalJson(record.operations) !== canonicalJson(plan)
        )
          throw new Fault(
            409,
            "A proposal already exists for this message. Review that proposal before retrying.",
          );
      } else {
        record = await tx.proposal.create({
          data: {
            ...(stableId ? { id: stableId } : {}),
            userId,
            conversationId: context.conversationId,
            operations: JSON.parse(JSON.stringify(plan)),
          },
        });
        fresh = true;
      }
    } else fresh = true;
    let settleNonce: string | undefined;
    if (context.arm && fresh) {
      settleNonce = crypto.randomUUID();
      await tx.preference.create({
        data: {
          userId,
          key: `coach.arm.${settleNonce}`,
          value: {
            digest: canonicalJson(plan),
            proposalId: record?.id ?? null,
            revision: record?.revision ?? null,
          },
        },
      });
    }
    const value = {
      userId,
      expires: Date.now() + 86400000,
      nonce: context.draftKey
        ? crypto
            .createHash("sha256")
            .update(userId + ":" + context.draftKey)
            .digest("hex")
            .slice(0, 40)
        : crypto.randomUUID(),
      plan,
      ...(record ? { proposalId: record.id, revision: record.revision } : {}),
      ...(settleNonce ? { settleNonce } : {}),
    };
    return {
      plan,
      token: sign(value),
      ...(record ? { id: record.id, revision: record.revision } : {}),
      status: "pending" as const,
    };
  });
}
export async function proposalDraft(
  userId: string,
  row: { id: string; revision: number; status: string; operations: unknown },
): Promise<Draft> {
  const stored = row.operations as any,
    plan = stored.plan || stored;
  let result = stored.result;
  if (row.status === "applied" && result) {
    const receipt = await db.ledger.findFirst({
      where: {
        userId,
        operation: "v1.coach.apply",
        status: "success",
        payload: { contains: `"proposalId":"${row.id}"` },
      },
      orderBy: { createdAt: "asc" },
    });
    if (receipt) result = { ...result, applyReceiptId: receipt.id };
  }
  return {
    id: row.id,
    revision: row.revision,
    status: row.status,
    plan,
    result,
    token:
      row.status === "pending"
        ? sign({
            userId,
            expires: Date.now() + 86400000,
            nonce: `proposal_${row.id}_${row.revision}`,
            plan,
            proposalId: row.id,
            revision: row.revision,
          })
        : "",
  };
}
export async function reject(userId: string, token: string) {
  const value = verify(token, userId);
  if (!value.proposalId) return { status: "rejected" };
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
    const row = await tx.proposal.findFirst({
      where: { userId, id: value.proposalId },
    });
    if (!row) throw new Fault(404, "Not found");
    if (row.status === "rejected") return { status: "rejected" };
    if (row.status !== "pending" || row.revision !== value.revision)
      throw new Fault(409, "Proposal changed");
    await clearArms(tx, userId, row.id);
    await tx.proposal.update({
      where: { id: row.id },
      data: { status: "rejected", revision: { increment: 1 } },
    });
    return { status: "rejected" };
  });
}
function publicToken(value: z.infer<typeof envelope>) {
  const { settleNonce: _nonce, plan, ...rest } = value;
  return sign({ ...rest, plan });
}
function pendingDraft(
  value: z.infer<typeof envelope> & { plan: Plan },
): Draft {
  return {
    plan: value.plan,
    token: publicToken(value),
    ...(value.proposalId
      ? { id: value.proposalId, revision: value.revision }
      : {}),
    status: "pending",
  };
}
async function commit(
  user: Principal,
  token: string,
  confirmation: string,
  mode: "approval" | "trust",
) {
  const value = verify(token, user.userId);
  const plan = value.plan;
  if (
    mode === "approval" &&
    plan.destructive &&
    confirmation !== "APPLY DESTRUCTIVE CHANGES"
  )
    throw new Fault(400, "Type APPLY DESTRUCTIVE CHANGES to confirm");
  const p: Principal = {
    userId: user.userId,
    actor: "agent:coach",
    approved: true,
  };
  const key = `coach.applied.${value.proposalId ? `${value.proposalId}_${value.revision}` : value.nonce}`;
  const audit: {
    proposalId: string | null;
    nonce: string;
    operations: Plan["operations"];
    trust: null | { patternId: string; policyRevision: number };
  } = {
    proposalId: value.proposalId ?? null,
    nonce: value.nonce,
    operations: plan.operations,
    trust: null,
  };
  return write(p, "v1.coach.apply", audit, async (tx) => {
      const replay = await tx.preference.findUnique({
        where: { userId_key: { userId: p.userId, key } },
      });
      if (replay) {
        const saved = replay.value as any;
        if (saved.digest !== canonicalJson(plan))
          throw new Fault(
            409,
            "Approval key already used for different changes",
          );
        if (value.settleNonce)
          await tx.preference.deleteMany({
            where: { userId: p.userId, key: `coach.arm.${value.settleNonce}` },
          });
        audit.trust = saved.outcome?.trust ?? null;
        return saved.outcome;
      }
      if (value.proposalId) {
        const row = await tx.proposal.findFirst({
          where: { userId: p.userId, id: value.proposalId },
        });
        const current =
          !!row &&
          row.status === "pending" &&
          row.revision === value.revision &&
          canonicalJson(row.operations) === canonicalJson(plan);
        if (!current) {
          if (mode === "trust") throw new TrustDeclined();
          if (!row) throw new Fault(404, "Not found");
          throw new Fault(409, "Proposal changed; no changes were saved");
        }
      }
      if (mode === "trust") {
        if (!value.settleNonce) throw new TrustDeclined();
        const arm = await tx.preference.findUnique({
          where: {
            userId_key: { userId: p.userId, key: `coach.arm.${value.settleNonce}` },
          },
        });
        const marker = arm?.value as
          | { digest?: string; proposalId?: string | null; revision?: number | null }
          | undefined;
        if (
          !marker ||
          marker.digest !== canonicalJson(plan) ||
          (marker.proposalId ?? null) !== (value.proposalId ?? null) ||
          (marker.revision ?? null) !== (value.revision ?? null)
        )
          throw new TrustDeclined();
      }
      const checked = await preparePlan(p.userId, plan.operations, tx);
      if (mode === "trust") {
        const decision = await CoachTrust.decide(tx, p.userId, checked);
        if (!decision) throw new TrustDeclined();
        audit.trust = {
          patternId: decision.patternId,
          policyRevision: decision.policyRevision,
        };
        await tx.preference.deleteMany({
          where: { userId: p.userId, key: `coach.arm.${value.settleNonce}` },
        });
      }
      if (checked.destructive && confirmation !== "APPLY DESTRUCTIVE CHANGES")
        throw new Fault(400, "Type APPLY DESTRUCTIVE CHANGES to confirm");
      const ids = new Map<string, string>();
      const changes: {
        id: string;
        kind: string;
        title: string;
        receiptId: string;
      }[] = [];
      const resolve = (id: string | null | undefined) =>
        id ? ids.get(id) || id : id;
      for (const op of plan.operations) {
        let result: any,
          kind = "item";
        if (op.op === "organize_moment") {
          const data: any = {
            ...op.data,
            projectId: resolve(op.data.projectId),
            delegateId: resolve(op.data.delegateId),
            tagIds: op.data.tagIds.map((t) => resolve(t)!),
          };
          const organized = await V1.organize(
            p,
            op.id,
            { revision: op.revision, item: data, resolved: true },
            tx,
          );
          const ref = organized.value.items.find(
            (r) => r.relation === "reference",
          );
          if (!ref) throw new Fault(500, "Canonical reference missing");
          result = { ...organized, value: ref.item };
        } else if (op.op === "create_item" || op.op === "update_item") {
          const data: any = { ...op.data };
          data.projectId = resolve(data.projectId);
          data.delegateId = resolve(data.delegateId);
          data.tagIds = (data.tagIds || []).map(resolve);
          for (const id of [
            data.projectId,
            data.delegateId,
            ...data.tagIds,
          ].filter(Boolean))
            if (
              plan.operations.some((o) => "key" in o && o.key === id) &&
              !ids.has(id)
            )
              throw new Fault(
                400,
                "Place new records before operations that reference them",
              );
          result =
            op.op === "create_item"
              ? await V1.createItem(p, data, tx)
              : await V1.updateItem(p, op.id, op.revision, data, tx);
        } else if (op.op === "archive_item") {
          const { data } = await itemData(tx, p.userId, op.id);
          result = await V1.updateItem(
            p,
            op.id,
            op.revision,
            { ...data, status: "archived" },
            tx,
          );
        } else if (op.op === "create_project") {
          kind = "project";
          result = await V1.createProject(
            p,
            { ...op.data, tagIds: op.data.tagIds.map((t) => resolve(t)!) },
            tx,
          );
        } else if (op.op === "update_project") {
          kind = "project";
          result = await V1.updateProject(
            p,
            op.id,
            op.revision,
            { ...op.data, tagIds: op.data.tagIds.map((t) => resolve(t)!) },
            tx,
          );
        } else if (op.op === "create_tag") {
          kind = "tag";
          result = await V1.createTag(p, op.data, tx);
        } else if (op.op === "link") {
          kind = "link";
          result = await V1.createLink(
            p,
            {
              fromId: resolve(op.fromId),
              toId: resolve(op.toId),
              type: op.type,
              note: op.note,
            },
            tx,
          );
        } else {
          kind = "link";
          result = await V1.deleteLink(p, op.id, tx);
        }
        if ("key" in op) ids.set(op.key, result.value.id);
        changes.push({
          id: result.value.id || (op.op === "unlink" && op.id),
          kind,
          title: result.value.title || result.value.name || kind,
          receiptId: result.receiptId,
        });
      }
      const outcome = { changes, atomic: true, trust: audit.trust };
      await tx.preference.create({
        data: {
          userId: p.userId,
          key,
          value: { digest: canonicalJson(plan), outcome },
        },
      });
      if (value.proposalId)
        await tx.proposal.update({
          where: { id: value.proposalId },
          data: {
            status: "applied",
            revision: { increment: 1 },
            operations: JSON.parse(JSON.stringify({ plan, result: outcome })),
          },
        });
      return outcome;
    },
  );
}
export function approve(user: Principal, token: string, confirmation: string) {
  return commit(user, token, confirmation, "approval");
}
export async function releaseDraft(userId: string, token: string) {
  const value = verify(token, userId);
  await CoachTrust.disarm(userId, value.settleNonce);
  return pendingDraft(value);
}
async function appliedReplay(
  userId: string,
  value: z.infer<typeof envelope> & { plan: Plan },
): Promise<Draft | null> {
  const key = `coach.applied.${value.proposalId ? `${value.proposalId}_${value.revision}` : value.nonce}`;
  const row = await db.preference.findUnique({
    where: { userId_key: { userId, key } },
  });
  const saved = row?.value as { digest?: string; outcome?: any } | undefined;
  if (!saved || saved.digest !== canonicalJson(value.plan)) return null;
  const receipt = await db.ledger.findFirst({
    where: {
      userId,
      operation: "v1.coach.apply",
      status: "success",
      payload: { contains: `"nonce":"${value.nonce}"` },
    },
    orderBy: { createdAt: "asc" },
  });
  return {
    plan: value.plan,
    token: "",
    ...(value.proposalId
      ? { id: value.proposalId, revision: value.revision }
      : {}),
    status: "applied",
    result: { ...saved.outcome, applyReceiptId: receipt?.id },
  };
}
export async function settle(userId: string, token: string): Promise<Draft> {
  const value = verify(token, userId);
  const replayed = await appliedReplay(userId, value);
  if (replayed) return replayed;
  if (!value.settleNonce) return pendingDraft(value);
  const policy = await CoachTrust.read(db, userId);
  const shape = CoachTrust.patternFor(value.plan);
  if (!shape || !policy.patterns.includes(shape)) {
    await CoachTrust.disarm(userId, value.settleNonce);
    return pendingDraft(value);
  }
  try {
    const applied = await commit(
      { userId, actor: `user:${userId}` },
      token,
      "",
      "trust",
    );
    return {
      plan: value.plan,
      token: "",
      ...(value.proposalId
        ? { id: value.proposalId, revision: value.revision }
        : {}),
      status: "applied",
      result: { ...applied.value, applyReceiptId: applied.receiptId },
    };
  } catch (error) {
    if (error instanceof TrustDeclined) {
      await CoachTrust.disarm(userId, value.settleNonce);
      return pendingDraft(value);
    }
    throw error;
  }
}
