import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  platformLoginSchema,
  type PlatformLoginInput,
} from '@restaurant-os/validation';
import type { Request, Response } from 'express';
import {
  ClientInfo,
  PlatformCtx,
  PlatformOnly,
  Public,
} from '../../common/decorators/auth.decorators';
import { ZodBody } from '../../common/decorators/validation.decorators';
import { AUTH_THROTTLE } from '../../common/throttle';
import type { PlatformContext } from '../../common/types/request-context';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { PlatformAuthService, type ClientMeta } from './platform-auth.service';
import {
  clearPlatformCookies,
  PLATFORM_REFRESH_COOKIE,
  setPlatformCookies,
} from './platform-cookies';

@ApiTags('platform-auth')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly auth: PlatformAuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Same tight bucket as tenant login: this is the highest-value credential
  // on the platform.
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({ summary: 'Sign in as a FoodOS platform administrator' })
  async login(
    @ZodBody(platformLoginSchema) dto: PlatformLoginInput,
    @ClientInfo() meta: ClientMeta,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { session, refreshToken } = await this.auth.login(dto, meta);
    setPlatformCookies(response, this.config, session.accessToken, refreshToken);
    return session;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the platform session' })
  async refresh(
    @Req() request: Request,
    @ClientInfo() meta: ClientMeta,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    const raw = cookies?.[PLATFORM_REFRESH_COOKIE] ?? '';
    const { session, refreshToken } = await this.auth.refresh(raw, meta);
    setPlatformCookies(response, this.config, session.accessToken, refreshToken);
    return session;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End the platform session' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
    await this.auth.logout(cookies?.[PLATFORM_REFRESH_COOKIE] ?? null);
    clearPlatformCookies(response, this.config);
    return { loggedOut: true };
  }

  @PlatformOnly()
  @Get('me')
  @ApiOperation({ summary: 'Current platform administrator' })
  me(@PlatformCtx() admin: PlatformContext) {
    return this.auth.me(admin.adminId);
  }
}
