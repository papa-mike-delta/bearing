# Polymorphic Item + Link as the digital brain

> Superseded for product work on 2026-10-26 by [ADR 0005](0005-sunset-legacy-domain-and-coach.md). The pre-V1 `Item` table is not the model to extend. V1 records live in `V1Item`. There is no conversion.

We model the entire life OS as a single Item table (with a type discriminator and JSON metadata) plus a Link table for directed, typed relationships. A small set of first-class types receive stronger normalized columns where queries need them. Goal and Routine are full Items that act as connectors rather than special container entities.

This keeps the graph uniform for the Coach, makes new types cheap to add, and matches the original intent of an interconnected digital brain. The alternative (fully normalized tables per type) was rejected because it fragments the model the Coach must traverse and makes cross-type links harder.

Indexes on Link (fromId+type, toId+type, type+fromId) and a unique constraint on (fromId, toId, type) keep the common graph queries fast in Postgres.
