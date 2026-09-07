import { Inject, Injectable } from '@nestjs/common';
import type { UpdateTenantPaymentConfigInput } from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { RequestContext } from '../../common/types/request-context';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';

const MASK = '••••••';
const PAYMENT_CONFIG_ID = '00000000-0000-0000-0000-000000000001';

type Creds = Record<string, string>;

function maskCreds(credentials: unknown): Creds {
  const out: Creds = {};
  if (credentials && typeof credentials === 'object') {
    for (const [k, v] of Object.entries(credentials as Record<string, unknown>)) {
      out[k] = v ? MASK : '';
    }
  }
  return out;
}

/**
 * How a single restaurant takes online payments: OFF, the platform's shared
 * gateway (PLATFORM), or its own gateway (OWN). Own-gateway credentials are
 * masked on read and preserved when the incoming value is still the mask.
 */
@Injectable()
export class PaymentsConfigService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaService) {}

  async get(ctx: RequestContext) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { tenantId: ctx.tenantId },
      select: {
        onlinePaymentMode: true,
        ownPaymentProvider: true,
        ownPaymentCredentials: true,
        ownPaymentSandbox: true,
        payCashEnabled: true,
        payCardOnSiteEnabled: true,
      },
    });
    if (!restaurant) throw AppException.notFound('رستوران');

    // Whether the platform's shared gateway is available to choose.
    const platform = await runAsSystem('payments: platform gateway availability', () =>
      this.prisma.platformPaymentConfig.findUnique({
        where: { id: PAYMENT_CONFIG_ID },
        select: { enabled: true, commissionBps: true },
      }),
    );

    return {
      mode: restaurant.onlinePaymentMode,
      ownProvider: restaurant.ownPaymentProvider,
      ownCredentials: maskCreds(restaurant.ownPaymentCredentials),
      ownSandbox: restaurant.ownPaymentSandbox,
      cashEnabled: restaurant.payCashEnabled,
      cardOnSiteEnabled: restaurant.payCardOnSiteEnabled,
      platformAvailable: platform?.enabled ?? false,
      platformCommissionBps: platform?.commissionBps ?? 400,
    };
  }

  async update(ctx: RequestContext, input: UpdateTenantPaymentConfigInput) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { tenantId: ctx.tenantId },
      select: { id: true, ownPaymentCredentials: true },
    });
    if (!restaurant) throw AppException.notFound('رستوران');

    const merged = this.mergeCreds(restaurant.ownPaymentCredentials, input.ownCredentials);
    await this.prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        onlinePaymentMode: input.mode,
        ownPaymentProvider: input.mode === 'OWN' ? input.ownProvider ?? null : null,
        ownPaymentCredentials: input.mode === 'OWN' ? merged : merged,
        ownPaymentSandbox: input.ownSandbox ?? true,
        ...(input.cashEnabled === undefined ? {} : { payCashEnabled: input.cashEnabled }),
        ...(input.cardOnSiteEnabled === undefined
          ? {}
          : { payCardOnSiteEnabled: input.cardOnSiteEnabled }),
      },
    });
    return this.get(ctx);
  }

  private mergeCreds(existing: unknown, incoming: Creds | undefined): Creds {
    const base: Creds =
      existing && typeof existing === 'object'
        ? (Object.fromEntries(
            Object.entries(existing as Record<string, unknown>).map(([k, v]) => [
              k,
              String(v ?? ''),
            ]),
          ) as Creds)
        : {};
    if (!incoming) return base;
    for (const [k, v] of Object.entries(incoming)) {
      if (v === MASK) continue;
      base[k] = v;
    }
    return base;
  }
}
