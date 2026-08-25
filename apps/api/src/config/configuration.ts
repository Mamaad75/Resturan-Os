/**
 * Typed application configuration, assembled once at boot from `process.env`.
 * Nothing else in the codebase reads `process.env` directly.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  timezone: string;
  port: number;
  apiPrefix: string;
  apiUrl: string;
  appUrl: string;
  corsOrigins: string[];
  databaseUrl: string;
  redisUrl: string | null;
  auth: {
    accessSecret: string;
    accessTtlSeconds: number;
    refreshTtlDays: number;
    cookieSecret: string;
    cookieDomain: string | undefined;
    cookieSecure: boolean;
  };
  throttle: { ttl: number; limit: number; authLimit: number };
  sms: {
    provider: string;
    apiKey: string | null;
    sender: string | null;
    maxAttempts: number;
  };
  payment: {
    provider: string;
    apiKey: string | null;
    callbackUrl: string;
  };
  storage: {
    driver: 'local' | 's3';
    localDir: string;
    publicUrl: string;
    endpoint: string | null;
    accessKey: string | null;
    secretKey: string | null;
    bucket: string;
    region: string;
  };
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string): string | null {
  const value = process.env[name];
  return value === undefined || value === '' ? null : value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}".`);
  }
  return parsed;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

export function loadConfiguration(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];
  const isProduction = nodeEnv === 'production';

  // Secrets may fall back to a development default, but never in production.
  const devSecretFallback = isProduction
    ? undefined
    : 'development-only-secret-value-not-for-production-use';

  const accessSecret = required('JWT_ACCESS_SECRET', devSecretFallback);
  if (isProduction && accessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production.');
  }

  const databaseUrl =
    nodeEnv === 'test'
      ? required('TEST_DATABASE_URL', process.env.DATABASE_URL)
      : required('DATABASE_URL');

  const storageDriver = (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3';
  if (storageDriver !== 'local' && storageDriver !== 's3') {
    throw new Error(`STORAGE_DRIVER must be "local" or "s3", got "${storageDriver}".`);
  }

  return {
    nodeEnv,
    isProduction,
    timezone: process.env.TZ ?? 'Asia/Tehran',
    port: int('API_PORT', 4000),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    apiUrl: process.env.API_URL ?? 'http://localhost:4000',
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    databaseUrl,
    redisUrl: optional('REDIS_URL'),
    auth: {
      accessSecret,
      accessTtlSeconds: int('JWT_ACCESS_TTL', 900),
      refreshTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 30),
      cookieSecret: required('COOKIE_SECRET', devSecretFallback),
      cookieDomain: optional('COOKIE_DOMAIN') ?? undefined,
      cookieSecure: bool('COOKIE_SECURE', isProduction),
    },
    throttle: {
      ttl: int('THROTTLE_TTL', 60),
      limit: int('THROTTLE_LIMIT', 120),
      authLimit: int('THROTTLE_AUTH_LIMIT', 10),
    },
    sms: {
      provider: process.env.SMS_PROVIDER ?? 'console',
      apiKey: optional('SMS_API_KEY'),
      sender: optional('SMS_SENDER'),
      maxAttempts: int('SMS_MAX_ATTEMPTS', 4),
    },
    payment: {
      provider: process.env.PAYMENT_PROVIDER ?? 'manual',
      apiKey: optional('PAYMENT_API_KEY'),
      callbackUrl:
        process.env.PAYMENT_CALLBACK_URL ?? 'http://localhost:3000/payment/callback',
    },
    storage: {
      driver: storageDriver,
      localDir: process.env.STORAGE_LOCAL_DIR ?? './storage/uploads',
      publicUrl: process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:4000/uploads',
      endpoint: optional('STORAGE_ENDPOINT'),
      accessKey: optional('STORAGE_ACCESS_KEY'),
      secretKey: optional('STORAGE_SECRET_KEY'),
      bucket: process.env.STORAGE_BUCKET ?? 'restaurant-os',
      region: process.env.STORAGE_REGION ?? 'us-east-1',
    },
  };
}

/** Injection token for the resolved config object. */
export const APP_CONFIG = 'APP_CONFIG';
