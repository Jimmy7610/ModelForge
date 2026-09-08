import { describe, it, expect } from 'vitest';
import { CommandPolicy } from '../src/main/process/command-policy';

describe('Process Environment Sanitization & Security (Tests 49-54)', () => {
  // Test 49: Strips TOKEN, API_KEY, SECRET, and PASSWORD variables
  it('49. strips secret and credential variables from child process environment', () => {
    process.env.TEST_API_KEY = 'super-secret-123';
    process.env.GITHUB_TOKEN = 'ghp_secret_token';
    process.env.DATABASE_PASSWORD = 'db_password_123';
    process.env.CLIENT_SECRET = 'oauth_secret_abc';
    process.env.MY_PRIVATE_KEY = 'rsa_private_key';
    process.env.AUTH_HEADER = 'Bearer xyz';

    try {
      const safeEnv = CommandPolicy.buildControlledEnvironment();

      expect(safeEnv.TEST_API_KEY).toBeUndefined();
      expect(safeEnv.GITHUB_TOKEN).toBeUndefined();
      expect(safeEnv.DATABASE_PASSWORD).toBeUndefined();
      expect(safeEnv.CLIENT_SECRET).toBeUndefined();
      expect(safeEnv.MY_PRIVATE_KEY).toBeUndefined();
      expect(safeEnv.AUTH_HEADER).toBeUndefined();
    } finally {
      delete process.env.TEST_API_KEY;
      delete process.env.GITHUB_TOKEN;
      delete process.env.DATABASE_PASSWORD;
      delete process.env.CLIENT_SECRET;
      delete process.env.MY_PRIVATE_KEY;
      delete process.env.AUTH_HEADER;
    }
  });

  // Test 50: Passes through system tooling variables (PATH, SYSTEMROOT, TEMP, etc.)
  it('50. preserves required system and toolchain variables', () => {
    const safeEnv = CommandPolicy.buildControlledEnvironment();

    if (process.platform === 'win32') {
      expect(safeEnv.PATH || safeEnv.Path).toBeDefined();
      expect(safeEnv.SYSTEMROOT || safeEnv.SystemRoot).toBeDefined();
      expect(safeEnv.TEMP || safeEnv.TMP).toBeDefined();
    } else {
      expect(safeEnv.PATH).toBeDefined();
      expect(safeEnv.HOME).toBeDefined();
    }
  });

  // Test 51: Case-insensitivity in secret detection
  it('51. detects secrets case-insensitively', () => {
    process.env.my_api_key_lowercase = 'val1';
    process.env.My_Secret_Mixed = 'val2';
    process.env.TOKEN_UPPER = 'val3';

    try {
      const safeEnv = CommandPolicy.buildControlledEnvironment();
      expect(safeEnv.my_api_key_lowercase).toBeUndefined();
      expect(safeEnv.My_Secret_Mixed).toBeUndefined();
      expect(safeEnv.TOKEN_UPPER).toBeUndefined();
    } finally {
      delete process.env.my_api_key_lowercase;
      delete process.env.My_Secret_Mixed;
      delete process.env.TOKEN_UPPER;
    }
  });

  // Test 52: Extra environment variables are also sanitized
  it('52. sanitizes additional environment variables provided explicitly', () => {
    const safeEnv = CommandPolicy.buildControlledEnvironment({
      SAFE_VAR: 'hello',
      EXTRA_API_KEY: 'forbidden',
      EXTRA_TOKEN: 'forbidden2',
    });

    expect(safeEnv.SAFE_VAR).toBe('hello');
    expect(safeEnv.EXTRA_API_KEY).toBeUndefined();
    expect(safeEnv.EXTRA_TOKEN).toBeUndefined();
  });

  // Test 53: Disallows undefined values from corrupting environment
  it('53. omits undefined values without crashing', () => {
    const safeEnv = CommandPolicy.buildControlledEnvironment();
    for (const val of Object.values(safeEnv)) {
      expect(val).toBeDefined();
      expect(typeof val).toBe('string');
    }
  });

  // Test 54: Passes NODE_ENV if set
  it('54. preserves NODE_ENV when configured', () => {
    const safeEnv = CommandPolicy.buildControlledEnvironment({ NODE_ENV: 'test' });
    expect(safeEnv.NODE_ENV).toBe('test');
  });
});
