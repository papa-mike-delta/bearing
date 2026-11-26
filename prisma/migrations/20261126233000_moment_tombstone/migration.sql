-- A deleted Journal moment leaves its client id behind so a late sync cannot recreate it.
CREATE TABLE "V1MomentTombstone" (
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,

    CONSTRAINT "V1MomentTombstone_pkey" PRIMARY KEY ("userId","clientId")
);

ALTER TABLE "V1MomentTombstone" ADD CONSTRAINT "V1MomentTombstone_owner_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
