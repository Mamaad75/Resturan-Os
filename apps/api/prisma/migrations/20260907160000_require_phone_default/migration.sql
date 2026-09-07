-- Collecting the customer's phone becomes the default (owner can still turn it
-- off per restaurant). New restaurants default ON; existing ones are switched
-- ON so the phone bank starts filling immediately.
ALTER TABLE "restaurants" ALTER COLUMN "requireCustomerPhone" SET DEFAULT true;
UPDATE "restaurants" SET "requireCustomerPhone" = true;
