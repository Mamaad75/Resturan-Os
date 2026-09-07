-- AlterTable: which in-person payment methods a restaurant offers.
-- Online is governed by the existing onlinePaymentMode column.
ALTER TABLE "restaurants" ADD COLUMN "payCashEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "restaurants" ADD COLUMN "payCardOnSiteEnabled" BOOLEAN NOT NULL DEFAULT true;
