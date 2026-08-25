import { Logger } from '@nestjs/common';
import type { AppConfig } from '../../config/configuration';
import { ConsoleSmsProvider } from './providers/console.provider';
import { KavenegarSmsProvider } from './providers/kavenegar.provider';
import { SmsIrProvider } from './providers/smsir.provider';
import type { SmsProvider } from './sms.provider';

const logger = new Logger('SmsProviderFactory');

/** Chooses the SMS adapter from configuration. */
export function createSmsProvider(config: AppConfig): SmsProvider {
  const { provider, apiKey, sender } = config.sms;

  switch (provider) {
    case 'kavenegar':
      if (!apiKey) {
        throw new Error('SMS_PROVIDER=kavenegar requires SMS_API_KEY to be set.');
      }
      return new KavenegarSmsProvider(apiKey, sender);
    case 'sms_ir':
      if (!apiKey || !sender) {
        throw new Error(
          'SMS_PROVIDER=sms_ir requires SMS_API_KEY and SMS_SENDER (line number).',
        );
      }
      return new SmsIrProvider(apiKey, sender);
    case 'console':
      return new ConsoleSmsProvider();
    default:
      logger.warn(
        `Unknown SMS_PROVIDER "${provider}"; falling back to the console provider.`,
      );
      return new ConsoleSmsProvider();
  }
}
