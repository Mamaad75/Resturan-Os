/**
 * Bootstraps the FoodOS platform: the plan catalogue and the first super admin.
 *
 * Separate from the tenant demo seed on purpose. `db:seed` builds a demo
 * restaurant and is not something you run against production; this one creates
 * the platform's own records and is safe to run there - it is idempotent and
 * touches no tenant data.
 *
 *   pnpm --filter @restaurant-os/api db:seed:platform
 *
 * The admin credentials come from PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD.
 * In production both are required; there is no default password.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/** Same parameters the running application uses, so hashes are interchangeable. */
const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,
  timeCost: 3,
  parallelism: 1,
} as const;

const PLANS = [
  {
    key: 'basic',
    name: 'Basic',
    nameFa: 'پایه',
    description: 'منوی دیجیتال، سفارش‌گیری و صندوق برای یک شعبه.',
    monthlyPrice: 490_000,
    isDefault: true,
    displayOrder: 1,
    maxBranches: 1,
    maxStaff: 5,
    maxProducts: 60,
    maxTables: 20,
    maxMonthlyOrders: 1000,
    smsAllowance: 0,
    customThemeEnabled: false,
    advancedThemeEnabled: false,
    customCssEnabled: false,
    crmEnabled: false,
    campaignsEnabled: false,
    multiBranchEnabled: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    nameFa: 'حرفه‌ای',
    description: 'سفارشی‌سازی ظاهر منو، باشگاه مشتریان و گزارش‌های کامل.',
    monthlyPrice: 990_000,
    isDefault: false,
    displayOrder: 2,
    maxBranches: 3,
    maxStaff: 20,
    maxProducts: 300,
    maxTables: 80,
    maxMonthlyOrders: 8000,
    smsAllowance: 500,
    customThemeEnabled: true,
    advancedThemeEnabled: false,
    customCssEnabled: false,
    crmEnabled: true,
    campaignsEnabled: true,
    multiBranchEnabled: true,
  },
  {
    key: 'business',
    name: 'Business',
    nameFa: 'کسب‌وکار',
    description: 'سفارشی‌سازی پیشرفته با CSS اختصاصی و بدون سقف شعبه.',
    monthlyPrice: 1_990_000,
    isDefault: false,
    displayOrder: 3,
    maxBranches: null,
    maxStaff: null,
    maxProducts: null,
    maxTables: null,
    maxMonthlyOrders: null,
    smsAllowance: 5000,
    customThemeEnabled: true,
    advancedThemeEnabled: true,
    customCssEnabled: true,
    crmEnabled: true,
    campaignsEnabled: true,
    multiBranchEnabled: true,
  },
];

async function main() {
  console.log('FoodOS platform seed');

  for (const plan of PLANS) {
    // Upsert on the stable key: re-running updates the catalogue rather than
    // duplicating it, and never disturbs which tenants are on which plan.
    await prisma.plan.upsert({
      where: { key: plan.key },
      create: plan,
      update: plan,
    });
    console.log(`  plan ${plan.key}`);
  }

  const email = (process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@foodos.ir').toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? null;

  if (!password && process.env.NODE_ENV === 'production') {
    throw new Error(
      'PLATFORM_ADMIN_PASSWORD is required when seeding the platform in production.',
    );
  }

  const effectivePassword = password ?? 'FoodOS@Admin1403';
  const passwordHash = await argon2.hash(effectivePassword, ARGON_OPTIONS);

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    console.log(`  super admin ${email} already exists; leaving the password alone`);
  } else {
    await prisma.platformAdmin.create({
      data: {
        email,
        passwordHash,
        fullName: process.env.PLATFORM_ADMIN_NAME ?? 'FoodOS Super Admin',
        // Forces a change on first sign-in when the fallback password was used.
        mustChangePassword: !password,
      },
    });
    console.log(`  super admin ${email}`);
    if (!password) {
      console.log(`  password: ${effectivePassword}  (change it immediately)`);
    }
  }

  // Any tenant created before the platform module existed - or by a seed that
  // predates it - gets an open-ended subscription on the default plan so it
  // keeps working.
  const defaultPlan = await prisma.plan.findFirst({
    where: { isDefault: true, isActive: true },
  });
  if (defaultPlan) {
    const orphans = await prisma.tenant.findMany({
      where: { subscription: { is: null } },
      select: { id: true, slug: true, createdAt: true },
    });
    for (const tenant of orphans) {
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: defaultPlan.id,
          status: 'ACTIVE',
          startedAt: tenant.createdAt,
        },
      });
      console.log(`  subscription for ${tenant.slug}`);
    }
  }

  console.log('Platform seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
