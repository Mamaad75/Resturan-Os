import {
  assertTenantScoped,
  isSystemScope,
  runAsSystem,
  TenantIsolationError,
  TENANT_SCOPED_MODELS,
} from './tenant-scope';

const TENANT = '11111111-1111-1111-1111-111111111111';

/**
 * This guard is the backstop behind explicit tenantId filters. If it stops
 * firing, a forgotten filter becomes a silent cross-tenant data leak instead
 * of an immediate, loud failure.
 */
describe('tenant isolation guard', () => {
  describe('reads', () => {
    it('rejects an unfiltered findMany on a tenant-owned model', () => {
      expect(() =>
        assertTenantScoped('Order', 'findMany', { where: { status: 'PENDING' } }),
      ).toThrow(TenantIsolationError);
    });

    it('rejects a findMany with no where clause at all', () => {
      expect(() => assertTenantScoped('Product', 'findMany', {})).toThrow(
        TenantIsolationError,
      );
    });

    it('accepts a tenant-filtered read', () => {
      expect(() =>
        assertTenantScoped('Order', 'findMany', { where: { tenantId: TENANT } }),
      ).not.toThrow();
    });

    it('accepts a compound unique that includes the tenant', () => {
      expect(() =>
        assertTenantScoped('Order', 'findUnique', {
          where: { tenantId_orderNumber: { tenantId: TENANT, orderNumber: '1001' } },
        }),
      ).not.toThrow();
    });

    it('accepts the tenant filter nested inside AND', () => {
      expect(() =>
        assertTenantScoped('Order', 'findFirst', {
          where: { AND: [{ tenantId: TENANT }, { status: 'READY' }] },
        }),
      ).not.toThrow();
    });

    it('rejects a null tenantId, which would match nothing meaningful', () => {
      expect(() =>
        assertTenantScoped('Order', 'findMany', { where: { tenantId: null } }),
      ).toThrow(TenantIsolationError);
    });

    it('guards aggregates and counts too', () => {
      for (const operation of ['count', 'aggregate', 'groupBy']) {
        expect(() => assertTenantScoped('Payment', operation, { where: {} })).toThrow(
          TenantIsolationError,
        );
      }
    });
  });

  describe('writes', () => {
    it('rejects a create that does not set the tenant', () => {
      expect(() =>
        assertTenantScoped('Product', 'create', { data: { name: 'x', nameFa: 'x' } }),
      ).toThrow(TenantIsolationError);
    });

    it('accepts a create that sets the tenant directly', () => {
      expect(() =>
        assertTenantScoped('Product', 'create', { data: { tenantId: TENANT } }),
      ).not.toThrow();
    });

    it('accepts a create that connects the tenant relation', () => {
      expect(() =>
        assertTenantScoped('Product', 'create', {
          data: { tenant: { connect: { id: TENANT } } },
        }),
      ).not.toThrow();
    });

    it('rejects a createMany where any row is missing the tenant', () => {
      expect(() =>
        assertTenantScoped('Product', 'createMany', {
          data: [{ tenantId: TENANT }, { name: 'orphan' }],
        }),
      ).toThrow(TenantIsolationError);
    });

    it('rejects unfiltered updates and deletes', () => {
      expect(() =>
        assertTenantScoped('Order', 'updateMany', {
          where: { status: 'PENDING' },
          data: { status: 'CANCELLED' },
        }),
      ).toThrow(TenantIsolationError);
      expect(() =>
        assertTenantScoped('Order', 'delete', { where: { id: 'some-id' } }),
      ).toThrow(TenantIsolationError);
    });

    it('requires an upsert to both filter and set the tenant', () => {
      expect(() =>
        assertTenantScoped('Customer', 'upsert', {
          where: { tenantId_phone: { tenantId: TENANT, phone: '09121234567' } },
          create: { phone: '09121234567' },
        }),
      ).toThrow(TenantIsolationError);

      expect(() =>
        assertTenantScoped('Customer', 'upsert', {
          where: { tenantId_phone: { tenantId: TENANT, phone: '09121234567' } },
          create: { tenantId: TENANT, phone: '09121234567' },
        }),
      ).not.toThrow();
    });
  });

  describe('scope of the guard', () => {
    it('ignores models that are not tenant-owned', () => {
      expect(() => assertTenantScoped('Tenant', 'findMany', {})).not.toThrow();
      expect(() =>
        assertTenantScoped('RefreshToken', 'findUnique', { where: { tokenHash: 'x' } }),
      ).not.toThrow();
    });

    it('covers every model that carries a tenantId column', () => {
      for (const model of ['Order', 'OrderItem', 'Payment', 'Product', 'AuditLog']) {
        expect(TENANT_SCOPED_MODELS.has(model)).toBe(true);
      }
    });
  });

  describe('runAsSystem', () => {
    it('suspends the guard for deliberate cross-tenant work', async () => {
      await runAsSystem('test', () => {
        expect(isSystemScope()).toBe(true);
        expect(() => assertTenantScoped('User', 'findMany', { where: {} })).not.toThrow();
      });
    });

    it('restores the guard once the scope unwinds', async () => {
      await runAsSystem('test', () => undefined);
      expect(isSystemScope()).toBe(false);
      expect(() => assertTenantScoped('User', 'findMany', { where: {} })).toThrow(
        TenantIsolationError,
      );
    });

    it('holds the scope across awaits, since Prisma promises resolve later', async () => {
      await runAsSystem('test', async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        // This is the case that matters: the query executes after the await.
        expect(isSystemScope()).toBe(true);
      });
    });

    it('does not leak the scope into unrelated concurrent work', async () => {
      let outsideSawSystemScope = false;
      await Promise.all([
        runAsSystem('inside', async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }),
        (async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          outsideSawSystemScope = isSystemScope();
        })(),
      ]);
      expect(outsideSawSystemScope).toBe(false);
    });
  });
});
