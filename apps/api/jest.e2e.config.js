/**
 * Integration tests: boot the real Nest application against a real PostgreSQL
 * database. Nothing is mocked, because the behaviour worth testing here -
 * transactions, tenant isolation, the state machine - only exists end to end.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 45_000,
  maxWorkers: 1,
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
