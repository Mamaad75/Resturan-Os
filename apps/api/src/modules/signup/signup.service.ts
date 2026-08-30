import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AuditAction,
  MENU_TEMPLATE_SPECS,
  MenuTemplate,
  ServiceMode,
  UserRole,
  type AuthSession,
} from '@restaurant-os/types';
import type { SignupInput } from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { AuditService } from '../audit/audit.service';
import { AuthService, type ClientMeta, type LoginResult } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';

/**
 * Per-business-type defaults.
 *
 * A café that has to configure VAT, service charge and prep times before it can
 * take a single order will abandon signup. These are sensible starting points
 * the owner can change later in settings.
 */
const BUSINESS_PRESETS = {
  cafe: {
    serviceModes: [ServiceMode.DINE_IN, ServiceMode.TAKEAWAY],
    estimatedPrepMinutes: 12,
    serviceChargeEnabled: true,
    serviceChargeBps: 1000,
    tagline: 'قهوه تخصصی و دسر خانگی',
    menuTemplate: MenuTemplate.CAFE,
    starterCategories: ['نوشیدنی گرم', 'نوشیدنی سرد', 'دسر'],
  },
  restaurant: {
    serviceModes: [ServiceMode.DINE_IN, ServiceMode.TAKEAWAY],
    estimatedPrepMinutes: 25,
    serviceChargeEnabled: true,
    serviceChargeBps: 1000,
    tagline: 'غذای تازه و دست‌ساز',
    menuTemplate: MenuTemplate.CLASSIC,
    starterCategories: ['پیش‌غذا', 'غذای اصلی', 'نوشیدنی'],
  },
  fastfood: {
    serviceModes: [ServiceMode.DINE_IN, ServiceMode.TAKEAWAY],
    estimatedPrepMinutes: 15,
    serviceChargeEnabled: false,
    serviceChargeBps: 0,
    tagline: 'سریع، داغ، تازه',
    menuTemplate: MenuTemplate.FASTFOOD,
    starterCategories: ['برگر', 'پیتزا', 'ساندویچ', 'نوشیدنی'],
  },
} as const;

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Public slug availability check.
   *
   * Cross-tenant by definition: the whole question is whether *any* tenant on
   * the platform already owns this address.
   */
  async isSlugAvailable(slug: string): Promise<{ slug: string; available: boolean }> {
    const [restaurant, tenant] = await runAsSystem(
      'signup: platform-wide slug availability',
      () =>
        Promise.all([
          this.prisma.restaurant.findFirst({ where: { slug }, select: { id: true } }),
          this.prisma.tenant.findFirst({ where: { slug }, select: { id: true } }),
        ]),
    );
    return { slug, available: !restaurant && !tenant };
  }

  /**
   * Creates a complete, immediately usable restaurant.
   *
   * Everything happens in one transaction: a half-created tenant with no owner
   * account or no menu would be unreachable and unfixable from the UI.
   */
  async signup(input: SignupInput, meta: ClientMeta): Promise<LoginResult> {
    const preset = BUSINESS_PRESETS[input.businessType];

    const availability = await this.isSlugAvailable(input.slug);
    if (!availability.available) {
      throw AppException.conflict(
        'این نشانی قبلاً استفاده شده است. نشانی دیگری انتخاب کنید.',
      );
    }

    // Email is unique per tenant, but a person reusing one across restaurants
    // would make login ambiguous, so it is rejected up front with a clear
    // message rather than surfacing later as "specify your restaurant".
    const emailTaken = await runAsSystem('signup: platform-wide email check', () =>
      this.prisma.user.findFirst({
        where: { email: input.email },
        select: { id: true },
      }),
    );
    if (emailTaken) {
      throw AppException.conflict(
        'این ایمیل قبلاً در سامانه ثبت شده است. وارد شوید یا ایمیل دیگری انتخاب کنید.',
      );
    }

    const passwordHash = await this.passwords.hash(input.password);

    const created = await runAsSystem('signup: create new tenant', () =>
      this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { name: input.restaurantName, slug: input.slug },
        });

        const restaurant = await tx.restaurant.create({
          data: {
            tenantId: tenant.id,
            name: input.restaurantName,
            slug: input.slug,
            tagline: preset.tagline,
            // A starting point, not a policy: the business type already tells
            // us which style fits, and a brand-new restaurant has no palette of
            // its own to preserve yet. From here the colour and logo are the
            // owner's, and changing template never touches them again.
            menuTemplate: preset.menuTemplate,
            accentColor: MENU_TEMPLATE_SPECS[preset.menuTemplate].defaultAccent,
            theme: MENU_TEMPLATE_SPECS[preset.menuTemplate].defaultTheme,
            serviceModes: [...preset.serviceModes],
            estimatedPrepMinutes: preset.estimatedPrepMinutes,
            serviceChargeEnabled: preset.serviceChargeEnabled,
            serviceChargeBps: preset.serviceChargeBps,
            // VAT is off by default: the owner opts in once they know their
            // registration status, rather than silently overcharging guests.
            taxEnabled: false,
            taxRateBps: 900,
          },
        });

        const branch = await tx.branch.create({
          data: {
            tenantId: tenant.id,
            restaurantId: restaurant.id,
            name: 'شعبه اصلی',
            slug: 'main',
            phone: input.phone,
          },
        });

        const menu = await tx.menu.create({
          data: { tenantId: tenant.id, branchId: branch.id },
        });

        // Starter categories so the menu screen is never an empty void.
        await tx.category.createMany({
          data: preset.starterCategories.map((nameFa, index) => ({
            tenantId: tenant.id,
            menuId: menu.id,
            name: nameFa,
            nameFa,
            displayOrder: index,
          })),
        });

        const owner = await tx.user.create({
          data: {
            tenantId: tenant.id,
            // The owner floats across branches rather than being pinned.
            branchId: null,
            email: input.email,
            fullName: input.ownerName,
            phone: input.phone,
            role: UserRole.OWNER,
            passwordHash,
            // They chose this password themselves, so no forced change.
            mustChangePassword: false,
          },
        });

        // A restaurant-level QR code exists from minute one.
        await tx.qrCode.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            type: 'RESTAURANT',
            label: `منوی ${restaurant.name}`,
            targetPath: `/r/${restaurant.slug}`,
          },
        });

        return { tenant, restaurant, branch, owner };
      }),
    );

    this.audit.record({
      tenantId: created.tenant.id,
      userId: created.owner.id,
      action: AuditAction.CREATE,
      entity: 'Tenant',
      entityId: created.tenant.id,
      metadata: {
        slug: created.restaurant.slug,
        businessType: input.businessType,
        signup: true,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    this.logger.log(
      `New restaurant signed up: ${created.restaurant.name} (/r/${created.restaurant.slug})`,
    );

    // Sign them straight in - asking someone to log in immediately after
    // choosing a password is friction with no security benefit.
    return this.auth.login(
      { email: input.email, password: input.password },
      meta,
    );
  }
}

export type { AuthSession };
