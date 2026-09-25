-- CreateTable: games (one per tenant)
CREATE TABLE "games" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "model" VARCHAR(20) NOT NULL DEFAULT 'SPIN',
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable: game_players (per tenant + phone)
CREATE TABLE "game_players" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120),
    "score" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "playsCount" INTEGER NOT NULL DEFAULT 0,
    "lastPlayAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable: game_plays (each play + outcome)
CREATE TABLE "game_plays" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "model" VARCHAR(20) NOT NULL,
    "scoreDelta" INTEGER NOT NULL DEFAULT 0,
    "rewardType" VARCHAR(20),
    "rewardValue" INTEGER,
    "couponId" UUID,
    "couponCode" VARCHAR(40),
    "label" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_plays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "games_tenantId_key" ON "games"("tenantId");
CREATE UNIQUE INDEX "game_players_tenantId_phone_key" ON "game_players"("tenantId", "phone");
CREATE INDEX "game_players_tenantId_score_idx" ON "game_players"("tenantId", "score");
CREATE INDEX "game_plays_tenantId_createdAt_idx" ON "game_plays"("tenantId", "createdAt");
CREATE INDEX "game_plays_playerId_idx" ON "game_plays"("playerId");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_plays" ADD CONSTRAINT "game_plays_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "game_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
