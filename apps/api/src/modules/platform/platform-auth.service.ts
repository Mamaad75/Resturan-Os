import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiErrorCode, type PlatformSession } from '@restaurant-os/types';
import type { PlatformLoginInput } from '@restaurant-os/validation';
import { AppException } from '../../common/exceptions/app.exception';
import type { PlatformTokenPayload } from '../../common/types/request-context';
import { generateOpaqueToken, hashToken } from '../../common/utils/token.util';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { PasswordService } from '../auth/password.service';

export interface ClientMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Sign-in for FoodOS staff.
 *
 * Mirrors the tenant auth flow - argon2 verification, opaque refresh tokens
 * hashed at rest, rotation on use - against a separate table and a separate
 * signing key. The duplication is deliberate: merging the two would mean one
 * bug could hand a tenant a platform session.
 */
@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
  ) {}

  async login(
    input: PlatformLoginInput,
    meta: ClientMeta,
  ): Promise<{ session: PlatformSession; refreshToken: string }> {
    // Platform tables carry no tenantId, so every read here is a system read.
    const admin = await runAsSystem('platform login', () =>
      this.prisma.platformAdmin.findUnique({ where: { email: input.email } }),
    );

    if (!admin || !admin.isActive) {
      // Same CPU cost as a real verification so a missing account is not
      // detectably faster than a wrong password.
      await this.passwords.fakeVerify();
      throw new AppException(
        ApiErrorCode.INVALID_CREDENTIALS,
        'ایمیل یا رمز عبور نادرست است.',
        401,
      );
    }

    const ok = await this.passwords.verify(admin.passwordHash, input.password);
    if (!ok) {
      throw new AppException(
        ApiErrorCode.INVALID_CREDENTIALS,
        'ایمیل یا رمز عبور نادرست است.',
        401,
      );
    }

    await runAsSystem('platform login: stamp', () =>
      this.prisma.platformAdmin.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      }),
    );

    const refreshToken = await this.issueRefreshToken(admin.id);
    this.logger.log(`Platform admin signed in: ${admin.email}`);

    return {
      session: await this.buildSession(admin),
      refreshToken,
    };
  }

  /** Rotates the refresh token: the presented one is revoked as it is used. */
  async refresh(
    rawToken: string,
    meta: ClientMeta,
  ): Promise<{ session: PlatformSession; refreshToken: string }> {
    const tokenHash = hashToken(rawToken);

    const record = await runAsSystem('platform refresh', () =>
      this.prisma.platformRefreshToken.findUnique({
        where: { tokenHash },
        include: { admin: true },
      }),
    );

    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new AppException(
        ApiErrorCode.TOKEN_INVALID,
        'نشست شما معتبر نیست. دوباره وارد شوید.',
        401,
      );
    }
    if (!record.admin.isActive) {
      throw AppException.forbidden('این حساب غیرفعال شده است.');
    }

    await runAsSystem('platform refresh: revoke', () =>
      this.prisma.platformRefreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      }),
    );

    return {
      session: await this.buildSession(record.admin),
      refreshToken: await this.issueRefreshToken(record.adminId),
    };
  }

  async logout(rawToken: string | null): Promise<void> {
    if (!rawToken) return;
    await runAsSystem('platform logout', () =>
      this.prisma.platformRefreshToken.updateMany({
        where: { tokenHash: hashToken(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  }

  async me(adminId: string): Promise<PlatformSession> {
    const admin = await runAsSystem('platform me', () =>
      this.prisma.platformAdmin.findUnique({ where: { id: adminId } }),
    );
    if (!admin || !admin.isActive) throw AppException.unauthenticated();
    return this.buildSession(admin);
  }

  private async buildSession(admin: {
    id: string;
    email: string;
    fullName: string;
    isActive: boolean;
    mustChangePassword: boolean;
    lastLoginAt: Date | null;
  }): Promise<PlatformSession> {
    const payload: PlatformTokenPayload = {
      sub: admin.id,
      scope: 'platform',
      email: admin.email,
      name: admin.fullName,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.auth.platformSecret,
      expiresIn: this.config.auth.accessTtlSeconds,
    });

    return {
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        isActive: admin.isActive,
        mustChangePassword: admin.mustChangePassword,
        lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
      },
      accessToken,
      expiresIn: this.config.auth.accessTtlSeconds,
    };
  }

  private async issueRefreshToken(adminId: string): Promise<string> {
    const raw = generateOpaqueToken();
    const expiresAt = new Date(
      Date.now() + this.config.auth.refreshTtlDays * 86_400_000,
    );
    await runAsSystem('platform refresh: issue', () =>
      this.prisma.platformRefreshToken.create({
        data: { adminId, tokenHash: hashToken(raw), expiresAt },
      }),
    );
    return raw;
  }
}
