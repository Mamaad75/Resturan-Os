-- Earlier draft sessions lack an owner key; leave them inaccessible to guests.
ALTER TABLE "game_sessions" ADD COLUMN "playerKeyHash" VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE "game_sessions" ALTER COLUMN "playerKeyHash" DROP DEFAULT;
ALTER TABLE "coupons" ADD COLUMN "rewardPlayerKeyHash" VARCHAR(64), ADD COLUMN "rewardPointsCost" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "game_sessions_tenantId_playerKeyHash_idx" ON "game_sessions"("tenantId", "playerKeyHash");
CREATE INDEX "coupons_tenantId_rewardPlayerKeyHash_idx" ON "coupons"("tenantId", "rewardPlayerKeyHash");
ALTER TABLE "loyalty_entries" ADD COLUMN "gamePlayerKeyHash" VARCHAR(64);
CREATE INDEX "loyalty_entries_tenantId_gamePlayerKeyHash_idx" ON "loyalty_entries"("tenantId", "gamePlayerKeyHash");
