-- Backfill: every tenant needs a subscription row.
--
-- Self-signed-up tenants never had a subscription created, which made platform
-- plan activation fail with "اشتراک یافت نشد" and left the admin settings page
-- unable to read a subscription. Give each tenant that lacks one a 14-day trial
-- on the default (or first active) plan. If no plan is seeded yet, the LATERAL
-- subquery yields no row and nothing is inserted.
INSERT INTO "subscriptions" (
  "id", "tenantId", "planId", "status",
  "startedAt", "trialEndsAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), t."id", p."id", 'TRIAL',
  now(), now() + interval '14 days', now(), now()
FROM "tenants" t
CROSS JOIN LATERAL (
  SELECT "id" FROM "plans"
  WHERE "isActive" = true
  ORDER BY "isDefault" DESC, "displayOrder" ASC
  LIMIT 1
) p
LEFT JOIN "subscriptions" s ON s."tenantId" = t."id"
WHERE s."id" IS NULL;
