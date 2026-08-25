import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ApiErrorCode,
  AuditAction,
  permissionsForRole,
  type AuthSession,
  type AuthUser,
} from '@restaurant-os/types';
import type { ChangePasswordInput, LoginInput } from '@restaurant-os/validation';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { AppException } from '../../common/exceptions/app.exception';
import type {
  AccessTokenPayload,
  RequestContext,
} from '../../common/types/request-context';
import { generateOpaqueToken, hashToken } from '../../common/utils/token.util';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';

export interface ClientMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface LoginResult {
  session: AuthSession;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, meta: ClientMeta): Promise<LoginResult> {
    // Resolving which tenant an email belongs to is by definition a
    // cross-tenant read, and the only one in the authenticated code path.
    const candidates = await runAsSystem('login: resolve tenant by email', () =>
      this.prisma.user.findMany({
        where: {
          email: input.email,
          ...(input.tenantSlug ? { tenant: { slug: input.tenantSlug } } : {}),
        },
        include: { tenant: true, branch: true },
      }),
    );

    const active = candidates.filter((u) => u.isActive && u.tenant.isActive);

    if (active.length === 0) {
      // Burn comparable CPU so a missing account is not detectably faster.
      await this.passwords.fakeVerify();
      throw new AppException(
        ApiErrorCode.INVALID_CREDENTIALS,
        'ایمیل یا رمز عبور نادرست است.',
        401,
      );
    }

    if (active.length > 1) {
      throw new AppException(
        ApiErrorCode.VALIDATION_FAILED,
        'این ایمیل در چند مجموعه ثبت شده است. لطفاً نشانی مجموعه را مشخص کنید.',
        422,
        { tenantSlug: ['انتخاب مجموعه الزامی است.'] },
      );
    }

    const user = active[0];
    const passwordOk = await this.passwords.verify(user.passwordHash, input.password);
    if (!passwordOk) {
      this.audit.record({
        tenantId: user.tenantId,
        userId: user.id,
        action: AuditAction.LOGIN_FAILED,
        entity: 'User',
        entityId: user.id,
        metadata: { email: input.email },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw new AppException(
        ApiErrorCode.INVALID_CREDENTIALS,
        'ایمیل یا رمز عبور نادرست است.',
        401,
      );
    }

    const branches = await this.prisma.branch.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });

    // Staff pinned to a branch stay there; unpinned admins default to the
    // requested branch, else the first active one.
    const resolvedBranchId =
      user.branchId ??
      (input.branchId && branches.some((b) => b.id === input.branchId)
        ? input.branchId
        : (branches[0]?.id ?? null));

    const refreshToken = await this.issueRefreshToken(user.id, meta);
    const accessToken = await this.signAccessToken({
      sub: user.id,
      tid: user.tenantId,
      bid: resolvedBranchId,
      role: user.role,
      email: user.email,
      name: user.fullName,
    });

    await this.prisma.user.update({
      where: { id: user.id, tenantId: user.tenantId },
      data: { lastLoginAt: new Date() },
    });

    this.audit.record({
      tenantId: user.tenantId,
      userId: user.id,
      action: AuditAction.LOGIN,
      entity: 'User',
      entityId: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return {
      refreshToken,
      session: {
        accessToken,
        expiresIn: this.config.auth.accessTtlSeconds,
        user: toAuthUser(user, resolvedBranchId),
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          slug: user.tenant.slug,
        },
        branches: branches.map((b) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          isActive: b.isActive,
        })),
      },
    };
  }

  /**
   * Rotates the refresh token: the presented token is revoked and a fresh one
   * issued, so a stolen cookie is usable at most once before it stops working.
   */
  async refresh(rawToken: string | undefined, meta: ClientMeta): Promise<LoginResult> {
    if (!rawToken) throw AppException.unauthenticated('نشست شما یافت نشد.');

    // Refresh tokens are not tenant-scoped rows - the presented token is what
    // identifies both the user and, transitively, the tenant.
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: { include: { tenant: true } } },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new AppException(
        ApiErrorCode.TOKEN_EXPIRED,
        'نشست شما منقضی شده است. دوباره وارد شوید.',
        401,
      );
    }
    if (!stored.user.isActive || !stored.user.tenant.isActive) {
      throw AppException.forbidden('حساب کاربری شما غیرفعال شده است.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = stored.user;
    const branches = await this.prisma.branch.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });
    const branchId = user.branchId ?? branches[0]?.id ?? null;

    const refreshToken = await this.issueRefreshToken(user.id, meta);
    const accessToken = await this.signAccessToken({
      sub: user.id,
      tid: user.tenantId,
      bid: branchId,
      role: user.role,
      email: user.email,
      name: user.fullName,
    });

    return {
      refreshToken,
      session: {
        accessToken,
        expiresIn: this.config.auth.accessTtlSeconds,
        user: toAuthUser(user, branchId),
        tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug },
        branches: branches.map((b) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          isActive: b.isActive,
        })),
      },
    };
  }

  async logout(rawToken: string | undefined, ctx?: RequestContext): Promise<void> {
    if (rawToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(rawToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (ctx) {
      this.audit.record({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: AuditAction.LOGOUT,
        entity: 'User',
        entityId: ctx.userId,
      });
    }
  }

  /** Revokes every session for a user - used when disabling an account. */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(ctx: RequestContext): Promise<AuthSession> {
    const user = await this.prisma.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      include: { tenant: true },
    });
    if (!user) throw AppException.unauthenticated();

    const branches = await this.prisma.branch.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });

    return {
      accessToken: '',
      expiresIn: this.config.auth.accessTtlSeconds,
      user: toAuthUser(user, ctx.branchId),
      tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug },
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        isActive: b.isActive,
      })),
    };
  }

  /** Re-issues an access token pinned to a different branch of the same tenant. */
  async switchBranch(ctx: RequestContext, branchId: string): Promise<{ accessToken: string; expiresIn: number }> {
    const user = await this.prisma.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
    });
    if (!user) throw AppException.unauthenticated();
    if (user.branchId && user.branchId !== branchId) {
      throw AppException.forbidden('شما فقط به شعبه خود دسترسی دارید.');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: ctx.tenantId, isActive: true },
    });
    if (!branch) throw AppException.notFound('شعبه');

    const accessToken = await this.signAccessToken({
      sub: user.id,
      tid: user.tenantId,
      bid: branch.id,
      role: user.role,
      email: user.email,
      name: user.fullName,
    });
    return { accessToken, expiresIn: this.config.auth.accessTtlSeconds };
  }

  async changePassword(
    ctx: RequestContext,
    input: ChangePasswordInput,
    meta: ClientMeta,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
    });
    if (!user) throw AppException.unauthenticated();

    const ok = await this.passwords.verify(user.passwordHash, input.currentPassword);
    if (!ok) {
      throw new AppException(
        ApiErrorCode.INVALID_CREDENTIALS,
        'رمز عبور فعلی نادرست است.',
        401,
      );
    }

    await this.prisma.user.update({
      where: { id: user.id, tenantId: ctx.tenantId },
      data: {
        passwordHash: await this.passwords.hash(input.newPassword),
        mustChangePassword: false,
      },
    });

    // Changing a password invalidates every other session.
    await this.revokeAllSessions(user.id);

    this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entity: 'User',
      entityId: user.id,
      metadata: { field: 'password' },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  }

  private signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwt.signAsync(payload, {
      secret: this.config.auth.accessSecret,
      expiresIn: this.config.auth.accessTtlSeconds,
    });
  }

  private async issueRefreshToken(userId: string, meta: ClientMeta): Promise<string> {
    const raw = generateOpaqueToken(32);
    const expiresAt = new Date(
      Date.now() + this.config.auth.refreshTtlDays * 24 * 60 * 60 * 1000,
    );
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      },
    });
    return raw;
  }
}

function toAuthUser(
  user: {
    id: string;
    tenantId: string;
    email: string;
    fullName: string;
    phone: string | null;
    role: AuthUser['role'];
    isActive: boolean;
    mustChangePassword: boolean;
  },
  branchId: string | null,
): AuthUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    permissions: permissionsForRole(user.role),
    branchId,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
  };
}
