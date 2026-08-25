import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Models whose rows belong to exactly one tenant. Every query against one of
 * these must be filtered by `tenantId`, and every write must set it.
 */
export const TENANT_SCOPED_MODELS = new Set([
  'Restaurant',
  'Branch',
  'User',
  'Menu',
  'Category',
  'Product',
  'ModifierGroup',
  'ModifierOption',
  'RestaurantTable',
  'QrCode',
  'Customer',
  'Order',
  'OrderItem',
  'OrderItemModifier',
  'OrderStatusHistory',
  'Payment',
  'Notification',
  'SmsMessage',
  'AuditLog',
]);

/** Reads that must inspect a filtered `where`. */
const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

/** Writes that address existing rows and must therefore also be filtered. */
const SCOPED_WRITE_OPERATIONS = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);

const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

/**
 * Marks a region of work as a deliberate cross-tenant system operation:
 * resolving which tenant an email belongs to at login, the SMS retry worker
 * sweeping the outbox, scheduled maintenance. Everything outside such a region
 * is required to be tenant-filtered.
 */
const systemScope = new AsyncLocalStorage<{ reason: string }>();

/**
 * Runs `fn` with the guard suspended.
 *
 * The callback is awaited *inside* the async-local scope on purpose: a Prisma
 * promise does not execute when it is created, so simply returning it here
 * would run the query after the scope had already unwound and the guard would
 * still fire.
 */
export async function runAsSystem<T>(
  reason: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  return systemScope.run({ reason }, async () => await fn());
}

export function isSystemScope(): boolean {
  return systemScope.getStore() !== undefined;
}

export class TenantIsolationError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant isolation violation: ${model}.${operation}() was called without a tenantId filter. ` +
        `Add tenantId to the where clause, or wrap deliberate cross-tenant work in runAsSystem().`,
    );
    this.name = 'TenantIsolationError';
  }
}

/** True when the `where` clause constrains the query to a single tenant. */
function whereIsTenantScoped(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false;
  const record = where as Record<string, unknown>;

  if (record.tenantId !== undefined && record.tenantId !== null) return true;

  // Compound unique selectors such as `tenantId_orderNumber: { ... }`.
  for (const key of Object.keys(record)) {
    if (key.startsWith('tenantId_')) {
      const value = record[key];
      if (
        value &&
        typeof value === 'object' &&
        (value as Record<string, unknown>).tenantId !== undefined
      ) {
        return true;
      }
    }
  }

  // `AND: [{ tenantId }, ...]` is equally safe.
  const and = record.AND;
  if (Array.isArray(and) && and.some((clause) => whereIsTenantScoped(clause))) {
    return true;
  }
  if (and && !Array.isArray(and) && whereIsTenantScoped(and)) return true;

  return false;
}

function dataSetsTenant(data: unknown): boolean {
  if (!data) return false;
  if (Array.isArray(data)) {
    return data.length === 0 || data.every((row) => dataSetsTenant(row));
  }
  if (typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  if (record.tenantId !== undefined && record.tenantId !== null) return true;
  // Relation-connect form: `tenant: { connect: { id } }`.
  const tenant = record.tenant as Record<string, unknown> | undefined;
  return Boolean(tenant?.connect ?? tenant?.create ?? tenant?.connectOrCreate);
}

/**
 * Returns `true` when the operation is safe, `false` when it violates
 * isolation. Nested writes (`order.create({ data: { items: { create: [...] } } })`)
 * are reached through their parent, which is itself checked, so only top-level
 * arguments are inspected.
 */
export function assertTenantScoped(
  model: string | undefined,
  operation: string,
  args: Record<string, unknown>,
): void {
  if (!model || !TENANT_SCOPED_MODELS.has(model)) return;
  if (isSystemScope()) return;

  if (READ_OPERATIONS.has(operation) || SCOPED_WRITE_OPERATIONS.has(operation)) {
    if (!whereIsTenantScoped(args?.where)) {
      // `upsert` may legitimately identify the row by a compound unique that
      // already includes tenantId; that is covered by whereIsTenantScoped.
      throw new TenantIsolationError(model, operation);
    }
    if (operation === 'upsert' && !dataSetsTenant(args?.create)) {
      throw new TenantIsolationError(model, `${operation}.create`);
    }
    return;
  }

  if (CREATE_OPERATIONS.has(operation)) {
    if (!dataSetsTenant(args?.data)) {
      throw new TenantIsolationError(model, operation);
    }
  }
}
