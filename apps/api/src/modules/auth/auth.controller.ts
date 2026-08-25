import {
  Body,
  Controller,
  Get,
  Inject,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  loginSchema,
  type ChangePasswordInput,
  type LoginInput,
} from '@restaurant-os/validation';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import {
  ClientInfo,
  Ctx,
  Public,
} from '../../common/decorators/auth.decorators';
import { ZodBody } from '../../common/decorators/validation.decorators';
import type { RequestContext } from '../../common/types/request-context';
import { AuthService, type ClientMeta } from './auth.service';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Deliberately tighter than the global bucket: this is the endpoint an
  // attacker would brute-force.
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Authenticate a staff user and start a session' })
  async login(
    @ZodBody(loginSchema) dto: LoginInput,
    @ClientInfo() meta: ClientMeta,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { session, refreshToken } = await this.authService.login(dto, meta);
    setAuthCookies(response, this.config, session.accessToken, refreshToken);
    return session;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  async refresh(
    @Req() request: Request,
    @ClientInfo() meta: ClientMeta,
    @Res({ passthrough: true }) response: Response,
  ) {
    const raw = (request as Request & { cookies?: Record<string, string> }).cookies?.[
      REFRESH_COOKIE
    ];
    const { session, refreshToken } = await this.authService.refresh(raw, meta);
    setAuthCookies(response, this.config, session.accessToken, refreshToken);
    return session;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const raw = (request as Request & { cookies?: Record<string, string> }).cookies?.[
      REFRESH_COOKIE
    ];
    await this.authService.logout(raw, request.ctx);
    clearAuthCookies(response, this.config);
    return { loggedOut: true };
  }

  @Get('me')
  @ApiOperation({ summary: 'Current user, tenant and accessible branches' })
  me(@Ctx() ctx: RequestContext) {
    return this.authService.me(ctx);
  }

  @Post('switch-branch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-issue an access token pinned to another branch' })
  async switchBranch(
    @Ctx() ctx: RequestContext,
    @Body('branchId') branchId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.switchBranch(ctx, branchId);
    response.cookie('ros_access', result.accessToken, {
      httpOnly: true,
      secure: this.config.auth.cookieSecure,
      sameSite: 'lax',
      domain: this.config.auth.cookieDomain,
      path: '/',
      maxAge: result.expiresIn * 1000,
    });
    return result;
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change own password; revokes all other sessions' })
  async changePassword(
    @Ctx() ctx: RequestContext,
    @ZodBody(changePasswordSchema) dto: ChangePasswordInput,
    @ClientInfo() meta: ClientMeta,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.changePassword(ctx, dto, meta);
    clearAuthCookies(response, this.config);
    return { changed: true };
  }
}
