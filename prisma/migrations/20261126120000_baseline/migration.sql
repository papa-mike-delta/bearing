-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationLedger" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "receipt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1Item" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'inbox',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{"version":1}',
    "projectId" TEXT,
    "delegateId" TEXT,
    "dueAt" TIMESTAMPTZ(3),
    "scheduledAt" TIMESTAMPTZ(3),
    "startAt" TIMESTAMPTZ(3),
    "endAt" TIMESTAMPTZ(3),
    "followUpAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "localDate" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "demoBatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "V1Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1SelfProfile" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "V1SelfProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "V1Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "demoBatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "V1Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1Tag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'tag',
    "demoBatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V1Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1ItemTag" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "V1ItemTag_pkey" PRIMARY KEY ("userId","itemId","tagId")
);

-- CreateTable
CREATE TABLE "V1ProjectTag" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "V1ProjectTag_pkey" PRIMARY KEY ("userId","projectId","tagId")
);

-- CreateTable
CREATE TABLE "V1Link" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "demoBatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V1Link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1Activity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" TEXT,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "localDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "demoBatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V1Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1JournalMoment" (
    "capturedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingestHash" TEXT,
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "localDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "needsOrganization" BOOLEAN NOT NULL DEFAULT true,
    "intendedType" TEXT,
    "demoBatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "V1JournalMoment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1MomentItem" (
    "userId" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'mention',

    CONSTRAINT "V1MomentItem_pkey" PRIMARY KEY ("userId","momentId","itemId","relation")
);

-- CreateTable
CREATE TABLE "V1Review" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "prompts" JSONB NOT NULL,
    "demoBatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "V1Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1ReviewItem" (
    "userId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,

    CONSTRAINT "V1ReviewItem_pkey" PRIMARY KEY ("userId","reviewId","itemId")
);

-- CreateTable
CREATE TABLE "V1Recurrence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "rule" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "demoBatchId" TEXT,

    CONSTRAINT "V1Recurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1TaskOccurrence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recurrenceId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "nextItemId" TEXT,
    "demoBatchId" TEXT,

    CONSTRAINT "V1TaskOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "demoBatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V1Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1Message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "demoBatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V1Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1Proposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "operations" JSONB NOT NULL,
    "demoBatchId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V1Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "V1Preference" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "V1Preference_pkey" PRIMARY KEY ("userId","key")
);

-- CreateTable
CREATE TABLE "V1Lease" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "V1Lease_pkey" PRIMARY KEY ("userId","itemId","token")
);

-- CreateTable
CREATE TABLE "V1Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "V1Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Setting_userId_idx" ON "Setting"("userId");

-- CreateIndex
CREATE INDEX "OperationLedger_actor_operation_status_createdAt_idx" ON "OperationLedger"("actor", "operation", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OperationLedger_userId_actor_operation_status_createdAt_idx" ON "OperationLedger"("userId", "actor", "operation", "status", "createdAt");

-- CreateIndex
CREATE INDEX "V1Item_userId_type_status_idx" ON "V1Item"("userId", "type", "status");

-- CreateIndex
CREATE INDEX "V1Item_userId_dueAt_idx" ON "V1Item"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "V1Item_userId_scheduledAt_idx" ON "V1Item"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "V1Item_userId_localDate_idx" ON "V1Item"("userId", "localDate");

-- CreateIndex
CREATE INDEX "V1Item_userId_startAt_endAt_idx" ON "V1Item"("userId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "V1Item_userId_projectId_idx" ON "V1Item"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "V1Item_userId_id_key" ON "V1Item"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "V1SelfProfile_itemId_key" ON "V1SelfProfile"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "V1SelfProfile_userId_itemId_key" ON "V1SelfProfile"("userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "V1Project_userId_id_key" ON "V1Project"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "V1Tag_userId_id_key" ON "V1Tag"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "V1Tag_userId_kind_name_key" ON "V1Tag"("userId", "kind", "name");

-- CreateIndex
CREATE INDEX "V1Link_userId_toId_type_idx" ON "V1Link"("userId", "toId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "V1Link_userId_fromId_toId_type_key" ON "V1Link"("userId", "fromId", "toId", "type");

-- CreateIndex
CREATE INDEX "V1Activity_userId_occurredAt_idx" ON "V1Activity"("userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "V1Activity_userId_id_key" ON "V1Activity"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "V1Activity_userId_clientId_key" ON "V1Activity"("userId", "clientId");

-- CreateIndex
CREATE INDEX "V1JournalMoment_userId_localDate_occurredAt_idx" ON "V1JournalMoment"("userId", "localDate", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "V1JournalMoment_userId_id_key" ON "V1JournalMoment"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "V1JournalMoment_userId_clientId_key" ON "V1JournalMoment"("userId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "V1Review_userId_id_key" ON "V1Review"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "V1Review_userId_period_localDate_key" ON "V1Review"("userId", "period", "localDate");

-- CreateIndex
CREATE UNIQUE INDEX "V1Recurrence_userId_id_key" ON "V1Recurrence"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "V1Recurrence_userId_itemId_key" ON "V1Recurrence"("userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "V1TaskOccurrence_nextItemId_key" ON "V1TaskOccurrence"("nextItemId");

-- CreateIndex
CREATE UNIQUE INDEX "V1TaskOccurrence_userId_id_key" ON "V1TaskOccurrence"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "V1TaskOccurrence_userId_itemId_key" ON "V1TaskOccurrence"("userId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "V1TaskOccurrence_userId_recurrenceId_scheduledAt_key" ON "V1TaskOccurrence"("userId", "recurrenceId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "V1Conversation_userId_id_key" ON "V1Conversation"("userId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "V1Invitation_tokenHash_key" ON "V1Invitation"("tokenHash");

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationLedger" ADD CONSTRAINT "OperationLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1Item" ADD CONSTRAINT "V1Item_userId_projectId_fkey" FOREIGN KEY ("userId", "projectId") REFERENCES "V1Project"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1Item" ADD CONSTRAINT "V1Item_userId_delegateId_fkey" FOREIGN KEY ("userId", "delegateId") REFERENCES "V1Item"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1SelfProfile" ADD CONSTRAINT "V1SelfProfile_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "V1Item"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1ItemTag" ADD CONSTRAINT "V1ItemTag_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "V1Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1ItemTag" ADD CONSTRAINT "V1ItemTag_userId_tagId_fkey" FOREIGN KEY ("userId", "tagId") REFERENCES "V1Tag"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1ProjectTag" ADD CONSTRAINT "V1ProjectTag_userId_projectId_fkey" FOREIGN KEY ("userId", "projectId") REFERENCES "V1Project"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1ProjectTag" ADD CONSTRAINT "V1ProjectTag_userId_tagId_fkey" FOREIGN KEY ("userId", "tagId") REFERENCES "V1Tag"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1Link" ADD CONSTRAINT "V1Link_userId_fromId_fkey" FOREIGN KEY ("userId", "fromId") REFERENCES "V1Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1Link" ADD CONSTRAINT "V1Link_userId_toId_fkey" FOREIGN KEY ("userId", "toId") REFERENCES "V1Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1Activity" ADD CONSTRAINT "V1Activity_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "V1Item"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1MomentItem" ADD CONSTRAINT "V1MomentItem_userId_momentId_fkey" FOREIGN KEY ("userId", "momentId") REFERENCES "V1JournalMoment"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1MomentItem" ADD CONSTRAINT "V1MomentItem_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "V1Item"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1ReviewItem" ADD CONSTRAINT "V1ReviewItem_userId_reviewId_fkey" FOREIGN KEY ("userId", "reviewId") REFERENCES "V1Review"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1ReviewItem" ADD CONSTRAINT "V1ReviewItem_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "V1Item"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1Recurrence" ADD CONSTRAINT "V1Recurrence_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "V1Item"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1TaskOccurrence" ADD CONSTRAINT "V1TaskOccurrence_userId_recurrenceId_fkey" FOREIGN KEY ("userId", "recurrenceId") REFERENCES "V1Recurrence"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1TaskOccurrence" ADD CONSTRAINT "V1TaskOccurrence_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "V1Item"("userId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1Message" ADD CONSTRAINT "V1Message_userId_conversationId_fkey" FOREIGN KEY ("userId", "conversationId") REFERENCES "V1Conversation"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1Proposal" ADD CONSTRAINT "V1Proposal_userId_conversationId_fkey" FOREIGN KEY ("userId", "conversationId") REFERENCES "V1Conversation"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "V1Lease" ADD CONSTRAINT "V1Lease_userId_itemId_fkey" FOREIGN KEY ("userId", "itemId") REFERENCES "V1Item"("userId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-maintained objects Prisma's datamodel cannot emit.
-- Owner foreign keys omit ON UPDATE so they match the reviewed V1 SQL.
-- Checks and the Me triggers are the final post-migration definitions,
-- including located_at on V1MomentItem.relation.
ALTER TABLE "V1Item" ADD CONSTRAINT "V1Item_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1SelfProfile" ADD CONSTRAINT "V1SelfProfile_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1Project" ADD CONSTRAINT "V1Project_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1Tag" ADD CONSTRAINT "V1Tag_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1ItemTag" ADD CONSTRAINT "V1ItemTag_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1ProjectTag" ADD CONSTRAINT "V1ProjectTag_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1Link" ADD CONSTRAINT "V1Link_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1Activity" ADD CONSTRAINT "V1Activity_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1JournalMoment" ADD CONSTRAINT "V1JournalMoment_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1MomentItem" ADD CONSTRAINT "V1MomentItem_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1Review" ADD CONSTRAINT "V1Review_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1ReviewItem" ADD CONSTRAINT "V1ReviewItem_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1Recurrence" ADD CONSTRAINT "V1Recurrence_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1TaskOccurrence" ADD CONSTRAINT "V1TaskOccurrence_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1Conversation" ADD CONSTRAINT "V1Conversation_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1Message" ADD CONSTRAINT "V1Message_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1Proposal" ADD CONSTRAINT "V1Proposal_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1Preference" ADD CONSTRAINT "V1Preference_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

ALTER TABLE "V1Lease" ADD CONSTRAINT "V1Lease_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;

-- Enforce the vocabulary even for out-of-process writes.
ALTER TABLE "V1Item" ADD CONSTRAINT "V1Item_contract" CHECK (
  "type" IN ('task','note','habit','event','goal','person','bookmark') AND
  "status" IN ('inbox','todo','in_progress','delegated','done','archived') AND
  "priority" BETWEEN -2 AND 2 AND "revision" >= 0 AND
  jsonb_typeof("metadata") = 'object' AND "metadata"->>'version' = '1' AND
  ("type" <> 'event' OR ("startAt" IS NOT NULL AND "endAt" >= "startAt"))
);
ALTER TABLE "V1Tag" ADD CONSTRAINT "V1Tag_kind" CHECK ("kind" IN ('tag','area'));
ALTER TABLE "V1Review" ADD CONSTRAINT "V1Review_period" CHECK ("period" IN ('daily','weekly','monthly'));
ALTER TABLE "V1Link" ADD CONSTRAINT "V1Link_type" CHECK ("fromId" <> "toId" AND "type" IN ('advances','tracks','related_to','mentions','scheduled_at','located_at'));
ALTER TABLE "V1MomentItem" ADD CONSTRAINT "V1MomentItem_relation" CHECK ("relation" IN ('mention', 'reference', 'located_at'));
ALTER TABLE "V1Activity" ADD CONSTRAINT "V1Activity_kind" CHECK ("kind" IN ('check_in','habit_completion','focus','observation','interaction','task_completion'));
ALTER TABLE "V1Proposal" ADD CONSTRAINT "V1Proposal_status" CHECK ("status" IN ('pending','approved','rejected','applied','failed'));
ALTER TABLE "V1Message" ADD CONSTRAINT "V1Message_role" CHECK ("role" IN ('user','assistant','system','tool'));
ALTER TABLE "V1TaskOccurrence" ADD CONSTRAINT "V1TaskOccurrence_next_owner" FOREIGN KEY ("userId","nextItemId") REFERENCES "V1Item"("userId","id") ON DELETE RESTRICT;

-- Identity is an ordinary Person Item. Every existing/new account gets exactly one.
CREATE FUNCTION v1_create_me() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "V1Item" ("id","userId","type","template","title","status","updatedAt")
    VALUES ('me_' || NEW.id, NEW.id, 'person', 'person', 'Me', 'todo', CURRENT_TIMESTAMP);
  INSERT INTO "V1SelfProfile" ("userId","itemId") VALUES (NEW.id,'me_' || NEW.id);
  RETURN NEW;
END; $$;
INSERT INTO "V1Item" ("id","userId","type","template","title","status","updatedAt")
  SELECT 'me_' || id, id, 'person','person','Me','todo',CURRENT_TIMESTAMP FROM "User";
INSERT INTO "V1SelfProfile" ("userId","itemId") SELECT id,'me_' || id FROM "User";
CREATE TRIGGER v1_account_me AFTER INSERT ON "User" FOR EACH ROW EXECUTE FUNCTION v1_create_me();
CREATE FUNCTION v1_protect_me() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'V1SelfProfile' THEN RAISE EXCEPTION 'Canonical Me identity cannot be removed or reassigned'; END IF;
  IF EXISTS (SELECT 1 FROM "V1SelfProfile" WHERE "itemId" = OLD.id) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Canonical Me cannot be deleted'; END IF;
    IF NEW.type <> 'person' OR NEW.status = 'archived' OR NEW."userId" <> OLD."userId" THEN
      RAISE EXCEPTION 'Canonical Me must remain an owned, unarchived Person';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER v1_self_immutable BEFORE UPDATE OR DELETE ON "V1SelfProfile" FOR EACH ROW EXECUTE FUNCTION v1_protect_me();
CREATE TRIGGER v1_me_person BEFORE UPDATE OR DELETE ON "V1Item" FOR EACH ROW EXECUTE FUNCTION v1_protect_me();

