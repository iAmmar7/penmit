import type { RedactPatternDef } from './types.js';

export interface RedactResult {
  redacted: string;
  count: number;
}

interface CompiledPattern {
  name: string;
  regex: RegExp;
}

// Each pattern matches the secret VALUE portion only (captured in group 1 or full match).
// We match the contextual prefix (key name, assignment, etc.) to reduce false positives,
// but only redact the secret value itself.
const BUILTIN_PATTERNS: CompiledPattern[] = [
  // AWS
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    name: 'AWS Secret Key',
    regex:
      /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/g,
  },

  // Generic API keys/tokens/secrets in assignments (KEY=value, "key": "value", key: value)
  {
    name: 'Generic Secret',
    regex:
      /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key|client[_-]?secret|app[_-]?secret|[_-]token|password|passwd|pwd)\s*[=:]\s*["']?([A-Za-z0-9_\-./+=]{16,})["']?/gi,
  },

  // GitHub tokens
  { name: 'GitHub Token', regex: /\b(ghp_[A-Za-z0-9]{36,})\b/g },
  { name: 'GitHub Token', regex: /\b(gho_[A-Za-z0-9]{36,})\b/g },
  { name: 'GitHub Token', regex: /\b(ghu_[A-Za-z0-9]{36,})\b/g },
  { name: 'GitHub Token', regex: /\b(ghs_[A-Za-z0-9]{36,})\b/g },
  { name: 'GitHub Token', regex: /\b(github_pat_[A-Za-z0-9_]{22,})\b/g },

  // Slack
  { name: 'Slack Token', regex: /\b(xoxb-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,})\b/g },
  { name: 'Slack Token', regex: /\b(xoxp-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,})\b/g },
  { name: 'Slack Token', regex: /\b(xoxs-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,})\b/g },

  // Stripe
  { name: 'Stripe Key', regex: /\b(sk_live_[A-Za-z0-9]{24,})\b/g },
  { name: 'Stripe Key', regex: /\b(rk_live_[A-Za-z0-9]{24,})\b/g },

  // Private keys (PEM) — redact entire block between BEGIN and END markers
  {
    name: 'Private Key',
    regex:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  // Catch standalone BEGIN header (e.g., truncated diffs missing the END marker)
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },

  // Bearer tokens in code
  { name: 'Bearer Token', regex: /Bearer\s+([A-Za-z0-9_\-.]{20,})/g },

  // Anthropic
  { name: 'Anthropic Key', regex: /\b(sk-ant-[A-Za-z0-9_-]{20,})\b/g },

  // OpenAI
  { name: 'OpenAI Key', regex: /\b(sk-(?!ant-)[A-Za-z0-9]{20,})\b/g },

  // Google
  { name: 'Google API Key', regex: /\b(AIzaSy[A-Za-z0-9_-]{33})\b/g },

  // Heroku — require contextual key name to avoid matching arbitrary UUIDs
  {
    name: 'Heroku Key',
    regex:
      /(?:HEROKU_API_KEY|HEROKU_AUTH_TOKEN|HEROKU_TOKEN)\s*[=:]\s*["']?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']?/gi,
  },

  // npm tokens
  { name: 'npm Token', regex: /\b(npm_[A-Za-z0-9]{36,})\b/g },

  // Connection strings with passwords
  { name: 'Connection String', regex: /:\/\/[^:]+:([^@\s]{8,})@/g },
];

export function compileCustomPatterns(defs: RedactPatternDef[]): CompiledPattern[] {
  const compiled: CompiledPattern[] = [];
  for (const def of defs) {
    try {
      compiled.push({ name: def.name, regex: new RegExp(def.pattern, 'g') });
    } catch {
      // Skip invalid regex — don't crash the CLI for a bad custom pattern
    }
  }
  return compiled;
}

function applyPatterns(diff: string, patterns: CompiledPattern[]): RedactResult {
  let redacted = diff;
  const found = new Set<string>();

  for (const { name, regex } of patterns) {
    // Reset lastIndex for global regexes
    regex.lastIndex = 0;

    redacted = redacted.replace(regex, (...args) => {
      found.add(name);
      const fullMatch: string = args[0];
      // If there's a capture group (args[1] is a string and not the offset), redact only the captured part
      const captureGroup: unknown = args[1];
      if (typeof captureGroup === 'string' && typeof args[2] === 'number') {
        return fullMatch.replace(captureGroup, '[REDACTED]');
      }
      return '[REDACTED]';
    });
  }

  return { redacted, count: found.size };
}

export function redactSecrets(diff: string, customPatterns: RedactPatternDef[] = []): RedactResult {
  const compiled = compileCustomPatterns(customPatterns);
  const allPatterns = [...BUILTIN_PATTERNS, ...compiled];
  return applyPatterns(diff, allPatterns);
}

export function isCloudProvider(provider: string, ollamaMode?: string): boolean {
  if (provider === 'anthropic' || provider === 'openai') return true;
  if (provider === 'ollama' && ollamaMode === 'cloud') return true;
  return false;
}
