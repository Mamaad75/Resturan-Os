-- Keep every visible part of a menu theme behind the same draft/publish wall.
-- The first theme migration stored preset and custom CSS in single columns,
-- which made those two values visible before the owner pressed Publish.

ALTER TABLE "menu_themes"
  ADD COLUMN "publishedPreset" VARCHAR(24) NOT NULL DEFAULT 'CLASSIC',
  ADD COLUMN "draftPreset" VARCHAR(24),
  ADD COLUMN "publishedCustomCss" VARCHAR(20000),
  ADD COLUMN "draftCustomCss" VARCHAR(20000);

-- Preserve the currently live values and retain CSS/preset on existing drafts.
UPDATE "menu_themes"
SET
  "publishedPreset" = "preset",
  "publishedCustomCss" = "customCss";

UPDATE "menu_themes" SET "draftPreset" = "preset", "draftCustomCss" = "customCss" WHERE "draft" IS NOT NULL;
