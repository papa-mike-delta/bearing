# Rigor rails before any Coach write

> Superseded for product work on 2026-10-26 by [ADR 0005](0005-sunset-legacy-domain-and-coach.md), and the schema split in that ADR is superseded by [ADR 0006](0006-one-schema-one-runtime.md). The legacy Coach tools and their enable flag are removed. Coach approval lives in `src/lib/v1/coach`.

The Coach is never allowed to write until three rails are live and tested:

1. Revision/conflict checks on every Item update (optimistic lock).
2. An operation ledger that records every mutation with actor, payload, status, and receipt.
3. Write caps (initial: 20 Item creates + 50 Link creates per rolling hour; no writes to an Item the user has open in an editor).

Coach tools stay behind a feature flag until these are merged. Links remain last-write-wins. Domain-layer purity can proceed in parallel.

The alternative (letting the Coach write early and adding safety later) was rejected because a single bad write on a personal life OS is expensive to unwind and erodes trust.
