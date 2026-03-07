// LLM prompts
export const SYSTEM_PROMPT =
  'You are a git commit message generator. Output ONLY the commit message line - no explanation, no description, no bullet points, no markdown, no preamble.';

export function getUserPrompt(diff: string, maxLength = 72): string {
  return `Write a single git commit message for the diff below using conventional commits format (feat, fix, chore, refactor, docs, style, test, etc).

Rules:
- Output ONLY the commit message, nothing else
- One line, no period at the end
- No explanation, no bullet points, no numbering
- Commit message must be ${maxLength} characters or fewer
- Example output: feat: add user authentication

<diff>
${diff}
</diff>`;
}

// CLI help text
export const HELP_TEXT = `
penmit - AI-powered git commit message generator

Usage:
  penmit [options]

Options:
  -m, --model <name>   Model to use (overrides saved default for this run)
  --max-length <n>     Max commit message length in characters (default: 72)
  --local              Use local Ollama for this run
  --cloud              Use Ollama Cloud for this run
  --anthropic          Use Anthropic (Claude) for this run
  --openai             Use OpenAI (Codex/GPT) for this run
  --no-redact          Disable secret redaction for this run
  --setup              Re-run the setup wizard to change saved defaults
  --reset              Delete saved settings and return to defaults
  -y, --yes            Skip confirmation prompt (use with --reset)
  -v, --version        Print version
  -h, --help           Show this help

Environment variables:
  ANTHROPIC_API_KEY    Use Anthropic Claude (sets provider to anthropic automatically)
  OPENAI_API_KEY       Use OpenAI (sets provider to openai automatically)
  OLLAMA_API_KEY       Use Ollama Cloud (sets provider to cloud automatically)
  OLLAMA_HOST          Custom local Ollama host (default: localhost:11434)
  DEBUG=1              Print request/response debug info

Examples:
  penmit
  penmit --model mistral
  penmit --anthropic --model claude-haiku-4-5-20251001
  penmit --openai --model codex-mini-latest
  penmit --cloud --model devstral-2
  penmit --setup
  penmit --reset
  penmit --reset --yes
  ANTHROPIC_API_KEY=sk-ant-... penmit
  OPENAI_API_KEY=sk-... penmit
  OLLAMA_API_KEY=sk-... penmit
`.trim();
