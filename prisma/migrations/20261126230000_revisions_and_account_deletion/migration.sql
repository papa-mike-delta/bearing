-- Revision checks for labels and activities. Tags and areas share V1Tag.
ALTER TABLE "V1Tag" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "V1Tag" ADD CONSTRAINT "V1Tag_revision" CHECK ("revision" >= 0);

ALTER TABLE "V1Activity" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "V1Activity" ADD CONSTRAINT "V1Activity_revision" CHECK ("revision" >= 0);

-- Canonical Me can be deleted only inside a transaction marked for that owning account.
-- set_config(..., true) is transaction-local, so the marker dies at commit or rollback.
CREATE OR REPLACE FUNCTION v1_protect_me() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  deleting text;
BEGIN
  deleting := NULLIF(current_setting('bearing.deleting_account', true), '');
  IF TG_OP = 'DELETE' AND deleting IS NOT NULL THEN
    IF TG_TABLE_NAME = 'V1SelfProfile' THEN
      IF OLD."userId" = deleting THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'Canonical Me identity cannot be removed or reassigned';
    END IF;
    IF TG_TABLE_NAME = 'V1Item' AND EXISTS (
      SELECT 1 FROM "V1SelfProfile" WHERE "itemId" = OLD.id
    ) THEN
      IF OLD."userId" = deleting THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'Canonical Me cannot be deleted';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'V1SelfProfile' THEN
    RAISE EXCEPTION 'Canonical Me identity cannot be removed or reassigned';
  END IF;
  IF EXISTS (SELECT 1 FROM "V1SelfProfile" WHERE "itemId" = OLD.id) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Canonical Me cannot be deleted';
    END IF;
    IF NEW.type <> 'person' OR NEW.status = 'archived' OR NEW."userId" <> OLD."userId" THEN
      RAISE EXCEPTION 'Canonical Me must remain an owned, unarchived Person';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
