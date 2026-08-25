import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfiguration } from './configuration';

/**
 * Resolves environment configuration exactly once at boot. If a required
 * variable is missing the process fails immediately with a clear message
 * rather than surfacing a confusing error on the first request.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: loadConfiguration }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
