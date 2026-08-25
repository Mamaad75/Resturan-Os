/**
 * SMS provider abstraction.
 *
 * Iranian restaurants each have their own preferred gateway, so the system is
 * never coupled to one. Adding a provider means implementing this interface
 * and registering it in the factory - nothing else in the codebase changes.
 */
export interface SmsSendResult {
  /** Provider-side message id, stored for delivery reconciliation. */
  providerRef: string | null;
  accepted: boolean;
  /** Provider error text, surfaced in the SMS log when accepted is false. */
  error?: string;
}

export interface SmsDeliveryStatus {
  delivered: boolean;
  pending: boolean;
  error?: string;
}

export interface SmsProvider {
  readonly name: string;
  send(to: string, body: string): Promise<SmsSendResult>;
  getStatus(providerRef: string): Promise<SmsDeliveryStatus>;
  /** Canonicalises a number into whatever form the provider expects. */
  normalizePhone(input: string): string | null;
}
