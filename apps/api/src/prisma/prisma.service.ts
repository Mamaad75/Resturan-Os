import { Logger, type Provider } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { assertTenantScoped } from './tenant-scope';

const logger = new Logger('Prisma');

/**
 * Client extension that enforces tenant scoping on every query touching a
 * tenant-owned model.
 *
 * Services still pass `tenantId` explicitly; this exists so that forgetting to
 * do so is a loud, immediate failure rather than a silent cross-tenant read.
 * Because interactive transactions hand back the *extended* client, the guard
 * applies inside transactions too.
 */
export function tenantGuardExtension() {
  return Prisma.defineExtension({
    name: 'tenant-isolation-guard',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          assertTenantScoped(model, operation, args as Record<string, unknown>);
          return query(args);
        },
      },
    },
  });
}

/**
 * Builds the application's database client. `$extends` returns a new object
 * rather than mutating in place, which is why this is a factory instead of an
 * injectable subclass of PrismaClient.
 */
export function createPrismaClient(config: Pick<AppConfig, 'databaseUrl'>) {
  const base = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  // `$on` is unavailable on extended clients, so wire logging up front.
  base.$on('warn', (event) => logger.warn(event.message));
  base.$on('error', (event) => logger.error(event.message));

  return base.$extends(tenantGuardExtension());
}

/** The injectable database client type used throughout the application. */
export type PrismaService = ReturnType<typeof createPrismaClient>;

/** Injection token: `@Inject(PRISMA) private readonly prisma: PrismaService`. */
export const PRISMA = Symbol('PRISMA');

export const prismaProvider: Provider = {
  provide: PRISMA,
  inject: [APP_CONFIG],
  useFactory: async (config: AppConfig): Promise<PrismaService> => {
    const client = createPrismaClient(config);
    await client.$connect();
    logger.log('Database connection established');
    return client;
  },
};

/**
 * Truncates every table. Only used by the integration test harness; refuses to
 * run against a production database.
 */
export async function truncateAllTables(prisma: PrismaService): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('truncateAllTables() must never run in production.');
  }
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
