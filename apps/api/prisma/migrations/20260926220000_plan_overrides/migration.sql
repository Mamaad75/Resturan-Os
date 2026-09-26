-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "featureOverrides" JSONB,
ADD COLUMN     "limitOverrides" JSONB,
ADD COLUMN     "overrideNote" VARCHAR(300);

