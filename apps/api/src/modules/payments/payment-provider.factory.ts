import { Logger } from '@nestjs/common';
import { PaymentMethod } from '@restaurant-os/types';
import type { AppConfig } from '../../config/configuration';
import { ManualPaymentProvider } from './providers/manual.provider';
import { ZarinpalPaymentProvider } from './providers/zarinpal.provider';
import type { PaymentProvider } from './payment.provider';

const logger = new Logger('PaymentProviderFactory');

export interface PaymentProviderRegistry {
  /** Always present: cash, card terminal and other in-person settlement. */
  manual: PaymentProvider;
  /** Configured gateway for ONLINE payments; null when none is set up. */
  online: PaymentProvider | null;
  /** Picks the right provider for a payment method. */
  forMethod(method: PaymentMethod): PaymentProvider | null;
}

export function createPaymentProviders(config: AppConfig): PaymentProviderRegistry {
  const manual = new ManualPaymentProvider();
  let online: PaymentProvider | null = null;

  switch (config.payment.provider) {
    case 'zarinpal':
      if (!config.payment.apiKey) {
        throw new Error(
          'PAYMENT_PROVIDER=zarinpal requires PAYMENT_API_KEY (merchant id).',
        );
      }
      online = new ZarinpalPaymentProvider(config.payment.apiKey);
      break;
    case 'manual':
      break;
    default:
      logger.warn(
        `Unknown PAYMENT_PROVIDER "${config.payment.provider}"; online payments disabled.`,
      );
  }

  return {
    manual,
    online,
    forMethod(method: PaymentMethod) {
      if (method === PaymentMethod.ONLINE) return online;
      return manual;
    },
  };
}
