-- Creates the separate database the integration test suite truncates freely,
-- so `pnpm test:e2e` never touches development data.
SELECT 'CREATE DATABASE restaurant_os_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'restaurant_os_test')\gexec

GRANT ALL PRIVILEGES ON DATABASE restaurant_os_test TO restaurant;
