import { Controller, Get, HttpCode, HttpStatus, Inject, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { signupSchema, slugSchema, type SignupInput } from '@restaurant-os/validation';
import type { Response } from 'express';
import { ClientInfo, Public } from '../../common/decorators/auth.decorators';
import { ZodBody } from '../../common/decorators/validation.decorators';
import { AUTH_THROTTLE } from '../../common/throttle';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import type { ClientMeta } from '../auth/auth.service';
import { setAuthCookies } from '../auth/cookies';
import { SignupService } from './signup.service';

@ApiTags('signup')
@Controller('public/signup')
export class SignupController {
  constructor(
    private readonly signup: SignupService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('slug-available')
  // Typed character by character in the signup form, so a little headroom.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check whether a public restaurant address is free' })
  async slugAvailable(@Query('slug') slug: string) {
    const parsed = slugSchema.safeParse(slug ?? '');
    if (!parsed.success) {
      return {
        slug: slug ?? '',
        available: false,
        reason: parsed.error.issues[0]?.message ?? 'نشانی معتبر نیست.',
      };
    }
    return this.signup.isSlugAvailable(parsed.data);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  // Account creation is the other endpoint worth brute-forcing.
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Create a new restaurant and its owner account',
    description:
      'Creates the tenant, restaurant, branch, menu, starter categories, owner ' +
      'account and restaurant QR code in one transaction, then signs the owner in.',
  })
  async create(
    @ZodBody(signupSchema) dto: SignupInput,
    @ClientInfo() meta: ClientMeta,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { session, refreshToken } = await this.signup.signup(dto, meta);
    setAuthCookies(response, this.config, session.accessToken, refreshToken);
    return session;
  }
}
