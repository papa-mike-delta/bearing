import crypto from "node:crypto";
import { db } from "@/lib/db";
import { owned, Fault, parse } from "../service";
import { id } from "../contracts";
import { z } from "zod";
import { canonicalJson } from "../json";
import type { ChatInput, Answer } from "./contracts";
import { proposalDraft } from "./proposals";
const memoryInput = z.strictObject({
  id: id.optional(),
  text: z.string().trim().min(1).max(400),
});
export class CoachStore {
  static async memories(userId: string) {
    return (
      await db.preference.findMany({
        where: { userId, key: { startsWith: "coach.memory." } },
        take: 10,
      })
    ).map((r) => ({
      id: r.key.slice(13),
      text: (r.value as any).text as string,
    }));
  }
  static async memory(userId: string, raw: unknown) {
    const input = parse(memoryInput, raw);
    const key = `coach.memory.${input.id || crypto.randomUUID()}`;
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
      if (
        !input.id &&
        (await tx.preference.count({
          where: { userId, key: { startsWith: "coach.memory." } },
        })) >= 10
      )
        throw new Fault(429, "Keep at most 10 remembered preferences");
      if (
        input.id &&
        !(await tx.preference.findUnique({
          where: { userId_key: { userId, key } },
        }))
      )
        throw new Fault(404, "Not found");
      await tx.preference.upsert({
        where: { userId_key: { userId, key } },
        create: { userId, key, value: { text: input.text } },
        update: { value: { text: input.text } },
      });
      return { id: key.slice(13), text: input.text };
    });
  }
  static async deleteMemory(userId: string, memoryId: string) {
    parse(id, memoryId);
    await db.preference.deleteMany({
      where: { userId, key: `coach.memory.${memoryId}` },
    });
    return { deleted: true };
  }
  static list(userId: string) {
    return db.conversation.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, title: true, createdAt: true },
    });
  }
  static async conversation(userId: string, conversationId: string) {
    await owned(db, userId, "conversation", conversationId);
    const [messages, rows] = await Promise.all([
      db.message.findMany({
        where: { userId, conversationId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.proposal.findMany({
        where: { userId, conversationId },
        orderBy: { createdAt: "asc" },
        take: 50,
      }),
    ]);
    const drafts = await Promise.all(
      rows.map((row) => proposalDraft(userId, row)),
    );
    return {
      id: conversationId,
      messages: messages.reverse().map((m) => {
        let answer;
        if (m.role === "assistant")
          try {
            answer = JSON.parse(m.content);
          } catch {}
        return {
          id: m.id,
          role: m.role,
          text: answer?.text ?? m.content,
          sources: answer?.sources || [],
          clarification: answer?.clarification,
          error: answer?.error,
        };
      }),
      drafts,
    };
  }
  static async remove(userId: string, conversationId: string) {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
      await owned(tx, userId, "conversation", conversationId);
      const active = await tx.preference.findUnique({
        where: {
          userId_key: { userId, key: `coach.active.${conversationId}` },
        },
      });
      if (active && (active.value as any).expires > Date.now())
        throw new Fault(409, "Wait for the current response before deleting");
      await tx.conversation.delete({ where: { id: conversationId } });
      await tx.preference.deleteMany({
        where: {
          userId,
          OR: [
            { key: `coach.active.${conversationId}` },
            {
              key: { startsWith: "coach.turn." },
              value: { path: ["conversationId"], equals: conversationId },
            },
          ],
        },
      });
      return { deleted: true };
    });
  }
  static async start(userId: string, input: ChatInput) {
    const hash = crypto
      .createHash("sha256")
      .update(
        canonicalJson({
          text: input.text,
          temporary: input.temporary,
          selected: input.selected,
        }),
      )
      .digest("hex");
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
      const rate = await tx.preference.findUnique({
        where: { userId_key: { userId, key: "coach.rate" } },
      });
      const previous = rate?.value as any;
      const count =
        previous?.start > Date.now() - 60000 ? previous.count + 1 : 1;
      if (count > 15)
        throw new Fault(429, "Coach is busy. Try again in a minute.");
      await tx.preference.upsert({
        where: { userId_key: { userId, key: "coach.rate" } },
        create: {
          userId,
          key: "coach.rate",
          value: { start: Date.now(), count },
        },
        update: {
          value: { start: count === 1 ? Date.now() : previous.start, count },
        },
      });
      if (input.temporary)
        return { conversationId: undefined, history: input.history };
      const turn = await tx.preference.findUnique({
        where: { userId_key: { userId, key: `coach.turn.${input.clientId}` } },
      });
      let state = turn?.value as any;
      if (state) {
        if (
          state.hash !== hash ||
          (input.conversationId &&
            state.conversationId !== input.conversationId)
        )
          throw new Fault(409, "Message key already used");
        if (state.status === "done") {
          const m = await tx.message.findFirst({
            where: { userId, id: state.assistantId },
          });
          if (m) {
            const saved = JSON.parse(m.content);
            const proposals = await tx.proposal.findMany({
              where: {
                userId,
                conversationId: state.conversationId,
                id: { in: saved.proposalIds || [] },
              },
            });
            return {
              conversationId: state.conversationId,
              replay: {
                ...saved,
                drafts: await Promise.all(
                  proposals.map((row) => proposalDraft(userId, row)),
                ),
              } as Answer,
              history: [],
            };
          }
        }
      }
      let conversationId = input.conversationId || state?.conversationId;
      if (conversationId)
        await owned(tx, userId, "conversation", conversationId);
      else
        conversationId = (
          await tx.conversation.create({
            data: { userId, title: input.text.slice(0, 80) },
          })
        ).id;
      const activeKey = `coach.active.${conversationId}`;
      const active = await tx.preference.findUnique({
        where: { userId_key: { userId, key: activeKey } },
      });
      if (active && (active.value as any).expires > Date.now())
        throw new Fault(
          409,
          "A response is already running in this conversation",
        );
      if (!state)
        await tx.message.create({
          data: { userId, conversationId, role: "user", content: input.text },
        });
      const history = await tx.message.findMany({
        where: { userId, conversationId, role: { in: ["user", "assistant"] } },
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      state = {
        hash,
        conversationId,
        status: "running",
        startedAt: Date.now(),
      };
      await tx.preference.upsert({
        where: { userId_key: { userId, key: `coach.turn.${input.clientId}` } },
        create: { userId, key: `coach.turn.${input.clientId}`, value: state },
        update: { value: state },
      });
      await tx.preference.upsert({
        where: { userId_key: { userId, key: activeKey } },
        create: {
          userId,
          key: activeKey,
          value: { clientId: input.clientId, expires: Date.now() + 90000 },
        },
        update: {
          value: { clientId: input.clientId, expires: Date.now() + 90000 },
        },
      });
      return {
        conversationId,
        history: history.reverse().map((m) => {
          let text = m.content;
          if (m.role === "assistant")
            try {
              text = JSON.parse(text).text || text;
            } catch {}
          return {
            role: m.role as "user" | "assistant",
            content: text.slice(0, 4000),
          };
        }),
      };
    });
  }
  static async finish(
    userId: string,
    input: ChatInput,
    conversationId: string | undefined,
    answer: Answer,
  ) {
    if (!conversationId) return;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
      const key = `coach.turn.${input.clientId}`;
      const turn = await tx.preference.findUnique({
        where: { userId_key: { userId, key } },
      });
      const state = turn?.value as any;
      if (!state || state.status !== "running") return;
      const row = await tx.message.create({
        data: {
          userId,
          conversationId,
          role: "assistant",
          content: JSON.stringify({
            ...answer,
            drafts: [],
            proposalIds: answer.drafts.flatMap((d) => (d.id ? [d.id] : [])),
          }),
        },
      });
      await tx.preference.update({
        where: { userId_key: { userId, key } },
        data: {
          value: {
            ...state,
            status: answer.error ? "error" : "done",
            assistantId: row.id,
          },
        },
      });
      await tx.preference.deleteMany({
        where: { userId, key: `coach.active.${conversationId}` },
      });
    });
  }
}
