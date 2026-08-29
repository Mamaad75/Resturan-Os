import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { AppConfig } from './config/configuration';

/**
 * Every piece of HTTP wiring the application needs, in one place.
 *
 * `main.ts` and the integration harness both call this, so a request in a test
 * travels through exactly the middleware chain it would in production - the
 * global prefix, the cookie parser and the uploads mount included.
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(config.apiPrefix, { exclude: ['health'] });

  app.use(
    helmet({
      // The API serves JSON and uploaded images, never HTML, so CSP here would
      // only restrict the image responses.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());
  app.use(cookieParser(config.auth.cookieSecret));

  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // The local storage driver writes to disk and hands out
  // `${STORAGE_PUBLIC_URL}/<key>` links, so this process has to serve them.
  // With the s3 driver the URLs point at the bucket and nothing is mounted.
  if (config.storage.driver === 'local') {
    const prefix = uploadsPrefix(config.storage.publicUrl);
    app.useStaticAssets(resolve(process.cwd(), config.storage.localDir), {
      prefix,
      // Uploaded keys are random UUIDs, so a long immutable cache is safe and
      // keeps the customer menu off the network on repeat scans.
      maxAge: '30d',
      immutable: true,
      index: false,
      dotfiles: 'deny',
    });
    logger.log(`Serving uploads from ${config.storage.localDir} at ${prefix}`);
  }
}

/**
 * The path half of STORAGE_PUBLIC_URL. Accepts a bare path as well as a full
 * URL so a deployment behind a reverse proxy can configure either.
 */
export function uploadsPrefix(publicUrl: string): string {
  const path = /^https?:\/\//i.test(publicUrl)
    ? new URL(publicUrl).pathname
    : publicUrl;
  const trimmed = path.replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
