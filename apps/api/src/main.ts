import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/configuration';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get<AppConfig>(APP_CONFIG);

  // All business timestamps are stored in UTC; this only affects log output
  // and any date formatting that falls back to the process timezone.
  process.env.TZ = config.timezone;

  app.setGlobalPrefix(config.apiPrefix, {
    exclude: ['health'],
  });

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

  // No global pipe: every mutating route declares its Zod schema explicitly via
  // @ZodBody / @ZodQuery, which both validates and normalises the payload.

  if (!config.isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Restaurant OS API')
      .setDescription(
        'Multi-tenant restaurant and cafe operating system. All responses use the ' +
          'envelope { success, data } or { success, error: { code, message } }.',
      )
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .addCookieAuth('ros_access')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${config.apiPrefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log(`Swagger UI at ${config.apiUrl}/${config.apiPrefix}/docs`);
  }

  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  logger.log(`Restaurant OS API listening on port ${config.port} (${config.nodeEnv})`);
}

void bootstrap();
