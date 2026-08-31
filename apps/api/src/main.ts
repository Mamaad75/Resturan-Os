import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { APP_CONFIG, type AppConfig } from './config/configuration';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: false,
  });
  const config = app.get<AppConfig>(APP_CONFIG);

  // All business timestamps are stored in UTC; this only affects log output
  // and any date formatting that falls back to the process timezone.
  process.env.TZ = config.timezone;

  configureApp(app, config);

  // No global pipe: every mutating route declares its Zod schema explicitly via
  // @ZodBody / @ZodQuery, which both validates and normalises the payload.

  if (!config.isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('FoodOS API')
      .setDescription(
        'FoodOS - multi-tenant operating system for cafes, restaurants and ' +
          'fast food. All responses use the ' +
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
  logger.log(`FoodOS API listening on port ${config.port} (${config.nodeEnv})`);
}

void bootstrap();
