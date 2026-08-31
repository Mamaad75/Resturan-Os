-- Backfill the CRM aggregate columns from the orders that already exist.
--
-- The order service maintains these going forward, but every customer created
-- before this release has zeros in them - which would make the customer book
-- read as though nobody had ever ordered anything.
--
-- Cancelled orders are excluded, matching the reversal the order service
-- applies when an order is cancelled after the fact.

UPDATE "customers" c
SET
  "dineInCount"  = COALESCE(agg.dine_in, 0),
  "takeawayCount" = COALESCE(agg.takeaway, 0),
  "firstOrderAt" = agg.first_order_at,
  "lastBranchId" = agg.last_branch_id,
  -- Only correct these where they disagree with the orders; a tenant that has
  -- been running on the new code already has them right.
  "ordersCount"  = COALESCE(agg.total_orders, 0),
  "totalSpent"   = COALESCE(agg.total_spent, 0)
FROM (
  SELECT
    o."customerId" AS customer_id,
    COUNT(*) FILTER (WHERE o."type" = 'DINE_IN')  AS dine_in,
    COUNT(*) FILTER (WHERE o."type" <> 'DINE_IN') AS takeaway,
    COUNT(*)                                       AS total_orders,
    SUM(o."total")                                 AS total_spent,
    MIN(o."createdAt")                             AS first_order_at,
    (ARRAY_AGG(o."branchId" ORDER BY o."createdAt" DESC))[1] AS last_branch_id
  FROM "orders" o
  WHERE o."customerId" IS NOT NULL
    AND o."status" <> 'CANCELLED'
  GROUP BY o."customerId"
) agg
WHERE c."id" = agg.customer_id;
