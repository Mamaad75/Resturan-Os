-- Customer-menu layout preset, chosen per restaurant.
ALTER TABLE "restaurants"
  ADD COLUMN "menuTemplate" VARCHAR(24) NOT NULL DEFAULT 'CLASSIC';
