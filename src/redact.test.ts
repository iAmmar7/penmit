import { describe, it, expect } from 'vitest';
import { redactSecrets, isCloudProvider, compileCustomPatterns } from './redact.js';

describe('redactSecrets', () => {
  it('redacts AWS access key IDs', () => {
    const diff = '+AWS_KEY=AKIAIOSFODNN7EXAMPLE';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(redacted).toContain('[REDACTED]');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts AWS secret access keys', () => {
    const diff = '+aws_secret_access_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts GitHub personal access tokens', () => {
    const diff = '+token = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij"';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts Slack tokens', () => {
    // Constructed at runtime to avoid triggering GitHub push protection
    const slackToken = ['xoxb', '1234567890', '1234567890', 'ABCDEFGHIJKLMNOPQRSTUVwx'].join('-');
    const diff = `+SLACK_TOKEN=${slackToken}`;
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain(slackToken);
    expect(count).toBeGreaterThan(0);
  });

  it('redacts Stripe live keys', () => {
    // Constructed at runtime to avoid triggering GitHub push protection
    const stripeKey = 'sk_live_' + 'ABCDEFGHIJKLMNOPQRSTUVWXyz';
    const diff = `+STRIPE_KEY=${stripeKey}`;
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain(stripeKey);
    expect(count).toBeGreaterThan(0);
  });

  it('redacts full PEM private key blocks', () => {
    const diff = `+-----BEGIN RSA PRIVATE KEY-----
+MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy5AHB
+dummybase64contenthere
+-----END RSA PRIVATE KEY-----`;
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn');
    expect(redacted).not.toContain('dummybase64contenthere');
    expect(redacted).toContain('[REDACTED]');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts standalone private key header when END marker is missing', () => {
    const diff = '+-----BEGIN PRIVATE KEY-----';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).toContain('[REDACTED]');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts generic api_key assignments', () => {
    const diff = '+api_key = "sk-abc123def456ghi789jkl012mno345pq"';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('sk-abc123def456ghi789jkl012mno345pq');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts connection strings with passwords', () => {
    const diff = '+DATABASE_URL=postgres://user:superSecretP@ss@localhost:5432/db';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('superSecretP@ss');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts Anthropic API keys', () => {
    const diff = '+ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnopqrstuv';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuv');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts OpenAI API keys', () => {
    const diff = '+OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuv';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('sk-proj-abcdefghijklmnopqrstuv');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts Bearer tokens', () => {
    const diff = '+Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc123');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts Google API keys', () => {
    const diff = '+GOOGLE_KEY=AIzaSyA1B2C3D4E5F6G7H8I9J0KlMnOpQrStUvW';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('AIzaSyA1B2C3D4E5F6G7H8I9J0KlMnOpQrStUvW');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts npm tokens', () => {
    const diff = '+//registry.npmjs.org/:_authToken=npm_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('npm_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
    expect(count).toBeGreaterThan(0);
  });

  it('redacts Heroku keys with contextual key name', () => {
    const diff = '+HEROKU_API_KEY=12345678-1234-1234-1234-123456789abc';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('12345678-1234-1234-1234-123456789abc');
    expect(count).toBeGreaterThan(0);
  });

  it('does not redact arbitrary UUIDs without Heroku context', () => {
    const diff = '+user_id = "12345678-1234-1234-1234-123456789abc"';
    const { redacted } = redactSecrets(diff);
    expect(redacted).toContain('12345678-1234-1234-1234-123456789abc');
  });

  it('does not match Anthropic keys with the OpenAI pattern', () => {
    const diff = '+KEY=sk-ant-api03-abcdefghijklmnopqrstuv';
    const { redacted, count } = redactSecrets(diff);
    expect(redacted).not.toContain('sk-ant-api03-abcdefghijklmnopqrstuv');
    // Should be caught by Anthropic pattern only, not double-counted as OpenAI
    expect(count).toBe(1);
  });

  it('returns count 0 for clean diffs', () => {
    const diff = `+const add = (a: number, b: number) => a + b;
+export default add;`;
    const { redacted, count } = redactSecrets(diff);
    expect(count).toBe(0);
    expect(redacted).toBe(diff);
  });

  it('handles multiple secrets in one diff', () => {
    const diff = `+API_KEY=sk-abc123def456ghi789jkl012mno345pq
+GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij
+-----BEGIN PRIVATE KEY-----`;
    const { count } = redactSecrets(diff);
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe('redactSecrets with custom patterns', () => {
  it('applies custom patterns alongside built-in ones', () => {
    const diff = '+INTERNAL_SERVICE_KEY=myapp_secret_abc123def456';
    const custom = [{ name: 'Internal Key', pattern: '\\bmyapp_secret_[a-z0-9]{12}\\b' }];
    const { redacted, count } = redactSecrets(diff, custom);
    expect(redacted).not.toContain('myapp_secret_abc123def456');
    expect(count).toBeGreaterThan(0);
  });

  it('custom pattern with capture group redacts only the captured part', () => {
    const diff = '+X-Internal-Token: supersecretvalue1234';
    const custom = [{ name: 'Internal Header', pattern: 'X-Internal-Token:\\s*(.{16,})' }];
    const { redacted, count } = redactSecrets(diff, custom);
    expect(redacted).toContain('X-Internal-Token:');
    expect(redacted).not.toContain('supersecretvalue1234');
    expect(count).toBeGreaterThan(0);
  });

  it('skips invalid custom regex without crashing', () => {
    const diff = '+safe code here';
    const custom = [{ name: 'Bad Pattern', pattern: '(invalid[' }];
    const { redacted, count } = redactSecrets(diff, custom);
    expect(count).toBe(0);
    expect(redacted).toBe(diff);
  });

  it('built-in patterns still work when custom patterns are provided', () => {
    const diff = '+KEY=AKIAIOSFODNN7EXAMPLE';
    const custom = [{ name: 'Custom', pattern: '\\bfoo_[a-z]+\\b' }];
    const { redacted, count } = redactSecrets(diff, custom);
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(count).toBeGreaterThan(0);
  });
});

describe('compileCustomPatterns', () => {
  it('compiles valid pattern definitions', () => {
    const defs = [{ name: 'Test', pattern: '\\btest_[a-z]+\\b' }];
    const compiled = compileCustomPatterns(defs);
    expect(compiled).toHaveLength(1);
    expect(compiled[0].name).toBe('Test');
    expect(compiled[0].regex).toBeInstanceOf(RegExp);
  });

  it('skips invalid regex patterns', () => {
    const defs = [
      { name: 'Valid', pattern: '\\bvalid\\b' },
      { name: 'Invalid', pattern: '(broken[' },
    ];
    const compiled = compileCustomPatterns(defs);
    expect(compiled).toHaveLength(1);
    expect(compiled[0].name).toBe('Valid');
  });

  it('returns empty array for empty input', () => {
    expect(compileCustomPatterns([])).toEqual([]);
  });
});

describe('isCloudProvider', () => {
  it('returns true for anthropic', () => {
    expect(isCloudProvider('anthropic')).toBe(true);
  });

  it('returns true for openai', () => {
    expect(isCloudProvider('openai')).toBe(true);
  });

  it('returns true for ollama cloud', () => {
    expect(isCloudProvider('ollama', 'cloud')).toBe(true);
  });

  it('returns false for ollama local', () => {
    expect(isCloudProvider('ollama', 'local')).toBe(false);
  });

  it('returns false for ollama without mode', () => {
    expect(isCloudProvider('ollama')).toBe(false);
  });
});
