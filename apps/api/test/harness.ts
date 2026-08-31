import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { APP_CONFIG, type AppConfig } from '../src/config/configuration';

/**
 * Integration harness.
 *
 * Boots the real application against the real test database - no mocks. The
 * behaviour worth covering here (transactions, tenant isolation, the state
 * machine, money arithmetic) only exists when the whole stack is wired up.
 */
export interface TestTenant {
  tenantId: string;
  restaurantId: string;
  restaurantSlug: string;
  branchId: string;
  menuId: string;
  categoryId: string;
  productId: string;
  /** Product with a required single-select modifier group. */
  modifierProductId: string;
  modifierOptionId: string;
  tableIds: string[];
  users: Record<string, { id: string; email: string; password: string }>;
}

export interface TestContext {
  app: INestApplication;
  prisma: PrismaClient;
  http: () => request.SuperTest<request.Test>;
}

const PASSWORD = 'TestPass12345';

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  const config = app.get<AppConfig>(APP_CONFIG);
  // Same wiring as production, so a test request cannot pass through a
  // middleware chain the real server does not have.
  configureApp(app, config);
  await app.init();

  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.TEST_DATABASE_URL } },
  });
  await prisma.$connect();

  return {
    app,
    prisma,
    http: () => request(app.getHttpServer()) as unknown as request.SuperTest<request.Test>,
  };
}

export async function closeTestApp(ctx: TestContext): Promise<void> {
  await ctx.prisma.$disconnect();
  await ctx.app.close();
}

/** Wipes every table between suites so tests never depend on each other. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/**
 * Builds a complete, independent tenant: restaurant, branch, menu, products
 * with modifiers, tables and one user per role.
 */
export async function seedTenant(
  prisma: PrismaClient,
  label: string,
  options: { planKey?: string } = {},
): Promise<TestTenant> {
  const slug = `${label}-${randomBytes(3).toString('hex')}`;

  const tenant = await prisma.tenant.create({
    data: { name: `مجموعه ${label}`, slug },
  });

  /*
   * Every tenant needs a subscription before it can write anything: the
   * entitlements resolver treats a tenant without one as expired, which is the
   * only safe default for a billing gate. Tests get the unlimited plan unless
   * they are specifically exercising a limit.
   */
  const plan = await ensurePlan(prisma, options.planKey ?? 'test-unlimited');
  await prisma.subscription.create({
    data: { tenantId: tenant.id, planId: plan.id, status: 'ACTIVE' },
  });

  const restaurant = await prisma.restaurant.create({
    data: {
      tenantId: tenant.id,
      name: `رستوران ${label}`,
      slug,
      serviceModes: ['DINE_IN', 'TAKEAWAY'],
      taxEnabled: true,
      taxRateBps: 900,
      serviceChargeEnabled: true,
      serviceChargeBps: 1000,
      estimatedPrepMinutes: 20,
      autoConfirmOrders: true,
      smsNotificationsEnabled: true,
    },
  });

  const branch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      name: 'شعبه اصلی',
      slug: 'main',
      phone: '02100000000',
    },
  });

  const menu = await prisma.menu.create({
    data: { tenantId: tenant.id, branchId: branch.id },
  });

  const category = await prisma.category.create({
    data: { tenantId: tenant.id, menuId: menu.id, name: 'Main', nameFa: 'اصلی' },
  });

  const product = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Test Burger',
      nameFa: 'برگر تست',
      price: 200_000,
    },
  });

  const modifierProduct = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Test Coffee',
      nameFa: 'قهوه تست',
      price: 100_000,
      modifierGroups: {
        create: {
          tenantId: tenant.id,
          name: 'Size',
          nameFa: 'اندازه',
          type: 'SINGLE',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          options: {
            create: [
              { tenantId: tenant.id, name: 'Small', nameFa: 'کوچک', priceDelta: 0 },
              { tenantId: tenant.id, name: 'Large', nameFa: 'بزرگ', priceDelta: 50_000 },
            ],
          },
        },
      },
    },
    include: { modifierGroups: { include: { options: true } } },
  });

  const largeOption = modifierProduct.modifierGroups[0].options.find(
    (option) => option.nameFa === 'بزرگ',
  )!;

  await prisma.restaurantTable.createMany({
    data: [1, 2, 3].map((number) => ({
      tenantId: tenant.id,
      branchId: branch.id,
      number,
      capacity: 4,
    })),
  });
  const tables = await prisma.restaurantTable.findMany({
    where: { tenantId: tenant.id },
    orderBy: { number: 'asc' },
  });

  const passwordHash = await argon2.hash(PASSWORD, {
    type: argon2.argon2id,
    // Deliberately weak parameters: the suite hashes many passwords and the
    // production cost would dominate the runtime without testing anything.
    memoryCost: 2 ** 12,
    timeCost: 2,
    parallelism: 1,
  });

  const roles = ['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER', 'ACCOUNTANT'] as const;
  const users: TestTenant['users'] = {};
  for (const role of roles) {
    const email = `${role.toLowerCase()}@${slug}.test`;
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        branchId: role === 'OWNER' ? null : branch.id,
        email,
        fullName: `${role} ${label}`,
        role,
        passwordHash,
      },
    });
    users[role] = { id: user.id, email, password: PASSWORD };
  }

  return {
    tenantId: tenant.id,
    restaurantId: restaurant.id,
    restaurantSlug: slug,
    branchId: branch.id,
    menuId: menu.id,
    categoryId: category.id,
    productId: product.id,
    modifierProductId: modifierProduct.id,
    modifierOptionId: largeOption.id,
    tableIds: tables.map((table) => table.id),
    users,
  };
}

/**
 * Plans the suite needs, created once and reused.
 *
 * `test-unlimited` is the default: no caps, every feature on, so a test that
 * is not about plans is never surprised by one. Tests that exercise limits ask
 * for a specific plan by key and create it themselves.
 */
export async function ensurePlan(
  prisma: PrismaClient,
  key: string,
  overrides: Record<string, unknown> = {},
) {
  const unlimited = {
    name: key,
    nameFa: key,
    monthlyPrice: 0,
    isActive: true,
    isDefault: false,
    maxBranches: null,
    maxStaff: null,
    maxProducts: null,
    maxTables: null,
    maxMonthlyOrders: null,
    smsAllowance: null,
    customThemeEnabled: true,
    advancedThemeEnabled: true,
    customCssEnabled: true,
    crmEnabled: true,
    campaignsEnabled: true,
    takeawayEnabled: true,
    dineInEnabled: true,
    waiterCallEnabled: true,
    reportsEnabled: true,
    couponsEnabled: true,
    multiBranchEnabled: true,
    ...overrides,
  };

  return prisma.plan.upsert({
    where: { key },
    create: { key, ...unlimited },
    update: unlimited,
  });
}

/** Creates a FoodOS platform administrator and returns its credentials. */
export async function seedPlatformAdmin(
  prisma: PrismaClient,
  email = `admin-${randomBytes(3).toString('hex')}@foodos.test`,
) {
  const passwordHash = await argon2.hash(PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 2 ** 12,
    timeCost: 2,
    parallelism: 1,
  });
  const admin = await prisma.platformAdmin.create({
    data: { email, passwordHash, fullName: 'Platform Tester' },
  });
  return { id: admin.id, email, password: PASSWORD };
}

/** Signs in as a platform administrator and returns the bearer token. */
export async function platformLogin(
  ctx: TestContext,
  account: { email: string; password: string },
): Promise<string> {
  const response = await ctx
    .http()
    .post('/api/platform/auth/login')
    .send({ email: account.email, password: account.password })
    .expect(200);
  return response.body.data.accessToken as string;
}

/** Signs in and returns the bearer token for a seeded role. */
export async function login(
  ctx: TestContext,
  tenant: TestTenant,
  role: keyof TestTenant['users'],
): Promise<string> {
  const account = tenant.users[role];
  const response = await ctx
    .http()
    .post('/api/auth/login')
    .send({ email: account.email, password: account.password })
    .expect(200);
  return response.body.data.accessToken as string;
}

export const uuid = () => randomUUID();
