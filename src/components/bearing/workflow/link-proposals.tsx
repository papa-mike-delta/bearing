"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "../layout";
import { itemDto, itemSeed } from "@/lib/v1/client-model";
import { LinkProposals, type LinkProposal, type ProposalScope } from "@/lib/v1/link-proposals";
import { useWorkspace } from "./context";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Could not save";

export function LinkProposalCards({
  momentId,
  itemId,
  scope,
  faded = false,
}: {
  momentId?: string;
  itemId?: string;
  scope?: ProposalScope;
  faded?: boolean;
}) {
  const { data, mutate, proposals } = useWorkspace();
  const [hidden, setHidden] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receiptId, setReceiptId] = useState("");
  const cards = (scope ? LinkProposals.forScope(data, scope, proposals) : LinkProposals.forContext(data, { momentId, itemId }, proposals)).filter(
    (card) => !hidden.includes(card.id),
  );
  async function accept(card: LinkProposal) {
    setBusy(card.id);
    setError("");
    setNotice("");
    try {
      const saved = await save(card);
      setReceiptId(saved.receiptId);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy("");
    }
  }
  function save(card: LinkProposal) {
    const accept = card.accept;
    if (accept.kind === "link")
      return mutate<{ receiptId: string }>("links", {
        fromId: accept.fromId,
        toId: accept.toId,
        type: accept.type,
        fromRevision: accept.fromRevision,
        toRevision: accept.toRevision,
      });
    if (accept.kind === "moment")
      return mutate<{ receiptId: string }>(`journal/${accept.momentId}/relate`, {
        itemId: accept.itemId,
        revision: accept.revision,
        relation: accept.relation,
      });
    if (accept.kind === "project")
      return mutate<{ receiptId: string }>(`items/${accept.itemId}/place`, {
        projectId: accept.projectId,
        revision: accept.revision,
      });
    return assignArea(card);
  }
  async function assignArea(card: LinkProposal) {
    const accept = card.accept;
    if (accept.kind !== "area")
      throw new Error("This suggestion is not an Area assignment");
    const item = data.items.find((entry) => entry.id === accept.itemId);
    if (!item) throw new Error("This Item is no longer in the workspace");
    return mutate<{ receiptId: string }>(
      `items/${item.id}`,
      {
        revision: accept.revision,
        data: {
          ...itemDto(itemSeed(item)),
          tagIds: [
            ...new Set([
              ...item.tags.map((entry) => entry.tagId),
              accept.tagId,
            ]),
          ],
        },
      },
      "PUT",
    );
  }
  function reject(card: LinkProposal) {
    const decision = LinkProposals.reject();
    if (decision.writes) return;
    setHidden((ids) => [...ids, card.id]);
    setError("");
    setReceiptId("");
    setNotice("Rejected. Nothing was written.");
  }
  if (!cards.length && !receiptId && !error && !notice) return null;
  return (
    <div className="space-y-3">
      {cards.length || receiptId || error || notice ? (
        <SectionCard title="Review connections">
          <div className="space-y-3">
            {cards.map((card) => (
              <article key={card.id} data-slot={faded ? "relationship-prompt" : undefined} className={faded ? "space-y-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground" : "space-y-2 text-sm"}>
                <p className="font-medium">
                  {card.confidence === "proposal" ? "Proposal" : "Suggestion"}
                  {" · "}
                  {card.title}
                </p>
                <p className="text-muted-foreground">{card.reason}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!!busy}
                    onClick={() => void accept(card)}
                  >
                    {card.acceptLabel}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!!busy}
                    onClick={() => reject(card)}
                  >
                    {card.rejectLabel}
                  </Button>
                </div>
              </article>
            ))}
            {notice ? (
              <p role="status" className="text-sm">
                {notice}
              </p>
            ) : null}
            {receiptId ? (
              <p role="status" className="text-sm">
                Saved. Receipt {receiptId}.{" "}
                <a className="underline" href={`/api/receipts/${receiptId}`}>
                  Open audit receipt
                </a>
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
