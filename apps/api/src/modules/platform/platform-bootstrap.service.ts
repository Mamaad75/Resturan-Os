import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PRISMA, type PrismaService } from '../../prisma/prisma.service';
import { runAsSystem } from '../../prisma/tenant-scope';
import { PasswordService } from '../auth/password.service';

/**
 * Creates the first FoodOS administrator and the starter plans on a fresh
 * deployment.
 *
 * The production image ships without ts-node, so `db:seed:platform` cannot run
 * inside the container - and a platform with no way to sign in is not much of a
 * platform. This closes that gap at startup.
 *
 * Three rules keep it safe to run on every boot:
 *   - it only ever creates, never updates, so a password changed after the
 *     first launch is never reset by a restart;
 *   - it does nothing at all once any administrator exists;
 *   - in production it does nothing unless PLATFORM_ADMIN_EMAIL and
 *     PLATFORM_ADMIN_PASSWORD are both set, so no deployment ever gets a
 *     default credential it did not choose.
 */
@Injectable()
export class PlatformBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformBootstrapService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await runAsSystem('platform bootstrap', () => this.ensureFirstAdmin());
    } catch (error) {
      // A bootstrap failure must not stop the API serving restaurants.
      this.logger.error(
        'Platform bootstrap failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async ensureFirstAdmin(): Promise<void> {
    const existing = await this.prisma.platformAdmin.count();
    if (existing > 0) return;

    const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.PLATFORM_ADMIN_PASSWORD;

    if (!email || !password) {
      this.logger.warn(
        'No platform administrator exists. Set PLATFORM_ADMIN_EMAIL and ' +
          'PLATFORM_ADMIN_PASSWORD and restart to create one.',
      );
      return;
    }

    if (password.length < 12) {
      this.logger.error(
        'PLATFORM_ADMIN_PASSWORD must be at least 12 characters; no administrator created.',
      );
      return;
    }

    await this.prisma.platformAdmin.create({
      data: {
        email,
        passwordHash: await this.passwords.hash(password),
        fullName: process.env.PLATFORM_ADMIN_NAME?.trim() || 'FoodOS Super Admin',
      },
    });
    this.logger.log(`Created the first FoodOS platform administrator: ${email}`);
  }
}
