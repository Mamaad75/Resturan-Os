/**
 * Database seed.
 *
 * Produces a complete, immediately usable کافه رُز tenant: staff accounts, a
 * full Persian menu, a 36-table floor plan, QR codes, customers and several
 * weeks of order history so the dashboard and reports have real data to show
 * on first launch.
 *
 * Idempotent: re-running wipes the demo tenant and rebuilds it.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import {
  SEED_CATEGORIES,
  SEED_CUSTOMERS,
  SEED_TABLE_ZONES,
  SEED_USERS,
} from './seed-data';

const prisma = new PrismaClient();

const TENANT_SLUG = 'cafe-roz';
const RESTAURANT_SLUG = 'cafe-roz';

function token(): string {
  return randomBytes(24).toString('hex');
}

/** Deterministic-ish pseudo random so history looks varied but plausible. */
function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log('Seeding Restaurant OS demo data...');

  // ---------------------------------------------------------------- tenant
  const existing = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (existing) {
    console.log('  removing previous demo tenant');
    await prisma.tenant.delete({ where: { id: existing.id } });
  }

  const tenant = await prisma.tenant.create({
    data: { name: 'کافه رُز', slug: TENANT_SLUG, plan: 'standard' },
  });

  const restaurant = await prisma.restaurant.create({
    data: {
      tenantId: tenant.id,
      name: 'کافه رُز',
      slug: RESTAURANT_SLUG,
      description:
        'کافه‌ای دنج در قلب شهر با قهوه تخصصی، برگرهای دست‌ساز و دسرهای خانگی.',
      tagline: 'قهوه تخصصی و غذای دست‌ساز',
      primaryColor: '#0B0B0D',
      accentColor: '#C9A24B',
      theme: 'dark',
      serviceModes: ['DINE_IN', 'TAKEAWAY'],
      currency: 'IRT',
      taxEnabled: true,
      taxRateBps: 900,
      serviceChargeEnabled: true,
      serviceChargeBps: 1000,
      estimatedPrepMinutes: 20,
      smsNotificationsEnabled: true,
      autoConfirmOrders: true,
    },
  });

  const branch = await prisma.branch.create({
    data: {
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      name: 'شعبه مرکزی',
      slug: 'markazi',
      address: 'تهران، خیابان ولیعصر، نبش کوچه بهار، پلاک ۱۲',
      phone: '02188776655',
      isOpen: true,
    },
  });

  // ----------------------------------------------------------------- users
  console.log('  creating staff accounts');
  for (const user of SEED_USERS) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        // Owners float across branches; everyone else is pinned to theirs.
        branchId: user.pinnedToBranch ? branch.id : null,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role,
        passwordHash: await argon2.hash(user.password, {
          type: argon2.argon2id,
          memoryCost: 65_536,
          timeCost: 3,
          parallelism: 4,
        }),
        // Demo credentials are public; force a change before real use.
        mustChangePassword: true,
      },
    });
  }

  // ------------------------------------------------------------------ menu
  console.log('  building menu');
  const menu = await prisma.menu.create({
    data: { tenantId: tenant.id, branchId: branch.id, name: 'منوی اصلی' },
  });

  const productIds: Array<{ id: string; price: number; discountPrice: number | null }> =
    [];

  for (const [categoryIndex, category] of SEED_CATEGORIES.entries()) {
    const createdCategory = await prisma.category.create({
      data: {
        tenantId: tenant.id,
        menuId: menu.id,
        name: category.name,
        nameFa: category.nameFa,
        description: category.description,
        displayOrder: categoryIndex,
      },
    });

    for (const [productIndex, product] of category.products.entries()) {
      const created = await prisma.product.create({
        data: {
          tenantId: tenant.id,
          categoryId: createdCategory.id,
          name: product.name,
          nameFa: product.nameFa,
          description: product.description,
          descriptionFa: product.descriptionFa,
          price: product.price,
          discountPrice: product.discountPrice ?? null,
          isAvailable: product.isAvailable ?? true,
          isFeatured: product.isFeatured ?? false,
          displayOrder: productIndex,
          preparationMinutes: product.preparationMinutes,
          calories: product.calories ?? null,
          ...(product.modifierGroups?.length
            ? {
                modifierGroups: {
                  create: product.modifierGroups.map((group, groupIndex) => ({
                    tenantId: tenant.id,
                    name: group.name,
                    nameFa: group.nameFa,
                    type: group.type,
                    isRequired: group.isRequired,
                    minSelect: group.minSelect,
                    maxSelect: group.maxSelect,
                    displayOrder: groupIndex,
                    options: {
                      create: group.options.map((option, optionIndex) => ({
                        tenantId: tenant.id,
                        name: option.name,
                        nameFa: option.nameFa,
                        priceDelta: option.priceDelta,
                        displayOrder: optionIndex,
                      })),
                    },
                  })),
                },
              }
            : {}),
        },
      });

      if (created.isAvailable) {
        productIds.push({
          id: created.id,
          price: created.price,
          discountPrice: created.discountPrice,
        });
      }
    }
  }

  // ---------------------------------------------------------------- tables
  console.log('  laying out 36 tables');
  const tableRows: Prisma.RestaurantTableCreateManyInput[] = [];
  for (const zone of SEED_TABLE_ZONES) {
    for (let number = zone.from; number <= zone.to; number += 1) {
      tableRows.push({
        tenantId: tenant.id,
        branchId: branch.id,
        number,
        capacity: zone.capacity,
        zone: zone.zone,
      });
    }
  }
  await prisma.restaurantTable.createMany({ data: tableRows });
  const tables = await prisma.restaurantTable.findMany({
    where: { tenantId: tenant.id, branchId: branch.id },
    orderBy: { number: 'asc' },
  });

  // --------------------------------------------------------------- QR codes
  console.log('  generating QR codes');
  await prisma.qrCode.create({
    data: {
      tenantId: tenant.id,
      branchId: branch.id,
      type: 'RESTAURANT',
      label: `منوی ${restaurant.name}`,
      targetPath: `/r/${restaurant.slug}`,
    },
  });
  await prisma.qrCode.createMany({
    data: tables.map((table) => ({
      tenantId: tenant.id,
      branchId: branch.id,
      tableId: table.id,
      type: 'TABLE' as const,
      label: `میز ${table.number}`,
      targetPath: `/r/${restaurant.slug}/t/${table.number}`,
    })),
  });

  // -------------------------------------------------------------- customers
  console.log('  creating customers');
  const customers = [];
  for (const customer of SEED_CUSTOMERS) {
    customers.push(
      await prisma.customer.create({
        data: { tenantId: tenant.id, phone: customer.phone, name: customer.name },
      }),
    );
  }

  // ------------------------------------------------------------------ orders
  console.log('  generating order history');
  const history = await seedOrders({
    tenantId: tenant.id,
    branchId: branch.id,
    restaurant,
    products: productIds,
    tables,
    customers,
  });

  // The branch counter must continue where the generated history stopped, or
  // the first live order would collide with a seeded order number.
  await prisma.branch.update({
    where: { id: branch.id },
    data: { orderSequence: history.lastOrderNumber },
  });

  console.log('');
  console.log('Seed complete.');
  console.log(`  tenant      : ${tenant.name} (/r/${restaurant.slug})`);
  console.log(`  branch      : ${branch.name}`);
  console.log(`  staff       : ${SEED_USERS.length} accounts`);
  console.log(`  categories  : ${SEED_CATEGORIES.length}`);
  console.log(`  products    : ${productIds.length} available`);
  console.log(`  tables      : ${tables.length}`);
  console.log(`  orders      : ${history.orderCount} (${history.openCount} still open)`);
  console.log('');
  console.log('Demo sign-in (all accounts must change password on first use):');
  for (const user of SEED_USERS) {
    console.log(`  ${user.role.padEnd(10)} ${user.email.padEnd(26)} ${user.password}`);
  }
}

interface SeedOrdersArgs {
  tenantId: string;
  branchId: string;
  restaurant: {
    taxEnabled: boolean;
    taxRateBps: number;
    serviceChargeEnabled: boolean;
    serviceChargeBps: number;
    estimatedPrepMinutes: number;
  };
  products: Array<{ id: string; price: number; discountPrice: number | null }>;
  tables: Array<{ id: string; number: number }>;
  customers: Array<{ id: string; phone: string; name: string | null }>;
}

/**
 * Generates ~5 weeks of completed orders plus a handful of live ones, so the
 * dashboard, reports and the kitchen display all have something real to render
 * the moment the app starts.
 */
async function seedOrders(args: SeedOrdersArgs) {
  const { tenantId, branchId, restaurant, products, tables, customers } = args;
  let sequence = 1000;
  let orderCount = 0;
  let openCount = 0;

  const productRows = await prisma.product.findMany({
    where: { tenantId, id: { in: products.map((p) => p.id) } },
    select: { id: true, name: true, nameFa: true, price: true, discountPrice: true },
  });

  const buildItems = () => {
    const lineCount = randomInt(1, 4);
    const chosen: typeof productRows = [];
    for (let i = 0; i < lineCount; i += 1) {
      const product = pick(productRows);
      if (!chosen.some((c) => c.id === product.id)) chosen.push(product);
    }
    return chosen.map((product) => {
      const quantity = randomInt(1, 3);
      const unitPrice =
        product.discountPrice != null && product.discountPrice < product.price
          ? product.discountPrice
          : product.price;
      return {
        productId: product.id,
        productName: product.name,
        productNameFa: product.nameFa,
        quantity,
        unitPrice,
        modifiersTotal: 0,
        lineTotal: unitPrice * quantity,
      };
    });
  };

  const totalsFor = (items: ReturnType<typeof buildItems>, discount = 0) => {
    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const discountTotal = Math.min(discount, subtotal);
    const base = subtotal - discountTotal;
    const serviceChargeTotal = restaurant.serviceChargeEnabled
      ? Math.round((base * restaurant.serviceChargeBps) / 10_000)
      : 0;
    const taxTotal = restaurant.taxEnabled
      ? Math.round(((base + serviceChargeTotal) * restaurant.taxRateBps) / 10_000)
      : 0;
    return {
      subtotal,
      discountTotal,
      serviceChargeTotal,
      taxTotal,
      total: base + serviceChargeTotal + taxTotal,
    };
  };

  // --- historical, completed orders across the last 35 days ---------------
  for (let daysAgo = 34; daysAgo >= 0; daysAgo -= 1) {
    // Weekends in Iran are Thursday/Friday; give them more covers.
    const day = new Date();
    day.setDate(day.getDate() - daysAgo);
    const weekday = day.getDay();
    const isBusy = weekday === 4 || weekday === 5;
    const ordersToday = randomInt(isBusy ? 14 : 6, isBusy ? 26 : 16);

    for (let i = 0; i < ordersToday; i += 1) {
      // Cluster orders around lunch (12-15) and evening (19-22).
      const hour = Math.random() < 0.45 ? randomInt(12, 15) : randomInt(18, 22);
      const createdAt = new Date(day);
      createdAt.setHours(hour, randomInt(0, 59), randomInt(0, 59), 0);

      const isDineIn = Math.random() < 0.68;
      const items = buildItems();
      const discount = Math.random() < 0.12 ? randomInt(20, 80) * 1000 : 0;
      const totals = totalsFor(items, discount);
      const customer = Math.random() < 0.5 ? pick(customers) : null;
      const table = isDineIn ? pick(tables) : null;
      sequence += 1;

      const completedAt = new Date(createdAt.getTime() + randomInt(25, 70) * 60_000);
      const method = Math.random() < 0.45 ? 'CASH' : Math.random() < 0.8 ? 'CARD' : 'ONLINE';

      await prisma.order.create({
        data: {
          tenantId,
          branchId,
          tableId: table?.id ?? null,
          customerId: customer?.id ?? null,
          orderNumber: String(sequence),
          trackingToken: token(),
          type: isDineIn ? 'DINE_IN' : 'TAKEAWAY',
          status: 'COMPLETED',
          paymentStatus: 'PAID',
          customerName: isDineIn ? null : (customer?.name ?? 'مهمان'),
          customerPhone: isDineIn ? null : (customer?.phone ?? null),
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          serviceChargeTotal: totals.serviceChargeTotal,
          total: totals.total,
          paidTotal: totals.total,
          createdAt,
          updatedAt: completedAt,
          completedAt,
          items: {
            create: items.map((item) => ({ tenantId, ...item, createdAt })),
          },
          statusHistory: {
            create: [
              { tenantId, fromStatus: null, toStatus: 'PENDING', actor: 'customer', createdAt },
              {
                tenantId,
                fromStatus: 'PENDING',
                toStatus: 'SENT_TO_KITCHEN',
                actor: 'staff',
                createdAt: new Date(createdAt.getTime() + 60_000),
              },
              {
                tenantId,
                fromStatus: 'SENT_TO_KITCHEN',
                toStatus: 'PREPARING',
                actor: 'staff',
                createdAt: new Date(createdAt.getTime() + 5 * 60_000),
              },
              {
                tenantId,
                fromStatus: 'PREPARING',
                toStatus: isDineIn ? 'READY' : 'READY_FOR_PICKUP',
                actor: 'staff',
                createdAt: new Date(createdAt.getTime() + 20 * 60_000),
              },
              {
                tenantId,
                fromStatus: isDineIn ? 'READY' : 'READY_FOR_PICKUP',
                toStatus: isDineIn ? 'SERVED' : 'PICKED_UP',
                actor: 'staff',
                createdAt: new Date(createdAt.getTime() + 25 * 60_000),
              },
              {
                tenantId,
                fromStatus: isDineIn ? 'SERVED' : 'PICKED_UP',
                toStatus: 'COMPLETED',
                actor: 'staff',
                createdAt: completedAt,
              },
            ],
          },
          payments: {
            create: [
              {
                tenantId,
                method: method as 'CASH' | 'CARD' | 'ONLINE',
                status: 'PAID',
                amount: totals.total,
                provider: method === 'ONLINE' ? 'zarinpal' : 'manual',
                paidAt: completedAt,
                createdAt: completedAt,
              },
            ],
          },
        },
      });
      orderCount += 1;
    }
  }

  // --- a few live orders so the KDS and POS are not empty on first load ---
  const liveStages: Array<{ status: 'SENT_TO_KITCHEN' | 'PREPARING' | 'READY'; minutesAgo: number }> = [
    { status: 'SENT_TO_KITCHEN', minutesAgo: 3 },
    { status: 'PREPARING', minutesAgo: 11 },
    { status: 'PREPARING', minutesAgo: 6 },
    { status: 'READY', minutesAgo: 18 },
  ];

  const usedTables = new Set<string>();
  for (const stage of liveStages) {
    const items = buildItems();
    const totals = totalsFor(items);
    const table = tables.find((t) => !usedTables.has(t.id));
    if (table) usedTables.add(table.id);
    sequence += 1;
    const createdAt = new Date(Date.now() - stage.minutesAgo * 60_000);

    const order = await prisma.order.create({
      data: {
        tenantId,
        branchId,
        tableId: table?.id ?? null,
        orderNumber: String(sequence),
        trackingToken: token(),
        type: 'DINE_IN',
        status: stage.status,
        paymentStatus: 'PENDING',
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        taxTotal: totals.taxTotal,
        serviceChargeTotal: totals.serviceChargeTotal,
        total: totals.total,
        estimatedReadyAt: new Date(
          createdAt.getTime() + restaurant.estimatedPrepMinutes * 60_000,
        ),
        createdAt,
        items: { create: items.map((item) => ({ tenantId, ...item, createdAt })) },
        statusHistory: {
          create: [
            { tenantId, fromStatus: null, toStatus: 'PENDING', actor: 'customer', createdAt },
            {
              tenantId,
              fromStatus: 'PENDING',
              toStatus: stage.status,
              actor: 'staff',
              createdAt: new Date(createdAt.getTime() + 60_000),
            },
          ],
        },
      },
    });

    if (table) {
      await prisma.restaurantTable.update({
        where: { id: table.id },
        data: { status: 'OCCUPIED', activeOrderId: order.id },
      });
    }
    orderCount += 1;
    openCount += 1;
  }

  // Keep customer aggregates consistent with the generated history.
  for (const customer of customers) {
    const stats = await prisma.order.aggregate({
      where: { tenantId, customerId: customer.id, status: 'COMPLETED' },
      _count: { _all: true },
      _sum: { total: true },
      _max: { createdAt: true },
    });
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        ordersCount: stats._count._all,
        totalSpent: stats._sum.total ?? 0,
        lastOrderAt: stats._max.createdAt,
      },
    });
  }

  return { orderCount, openCount, lastOrderNumber: sequence };
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
