/**
 * Forces the test profile before the application module is imported, so the
 * config loader picks TEST_DATABASE_URL rather than the development database.
 */
process.env.NODE_ENV = 'test';
process.env.TZ = 'Asia/Tehran';
process.env.SMS_PROVIDER = 'console';
process.env.PAYMENT_PROVIDER = 'manual';
process.env.JWT_ACCESS_SECRET ??= 'test-only-access-secret-value-0123456789abcdef';
process.env.COOKIE_SECRET ??= 'test-only-cookie-secret-value-0123456789abcdef';
// Rate limiting would make the suite flaky and tests nothing here.
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_AUTH_LIMIT = '100000';
process.env.THROTTLE_PUBLIC_ORDER_LIMIT = '100000';
