-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "title" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "description" VARCHAR(2000),
    "coverUrl" VARCHAR(500),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "accentColor" VARCHAR(9),
    "theme" VARCHAR(10),
    "menuTemplate" VARCHAR(24),
    "menuId" UUID,
    "capacity" INTEGER,
    "rsvpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_rsvps" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "note" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_rsvps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_tenantId_idx" ON "events"("tenantId");

-- CreateIndex
CREATE INDEX "events_branchId_idx" ON "events"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "events_tenantId_slug_key" ON "events"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "event_rsvps_tenantId_idx" ON "event_rsvps"("tenantId");

-- CreateIndex
CREATE INDEX "event_rsvps_eventId_idx" ON "event_rsvps"("eventId");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
