// LLM prompts
export const SYSTEM_PROMPT =
  'You are a git commit message generator. Output ONLY the commit message line — no explanation, no description, no bullet points, no markdown, no preamble.';

export function getUserPrompt(diff: string): string {
  return `Write a single git commit message for the diff below using conventional commits format (feat, fix, chore, refactor, docs, style, test, etc).

Rules:
- Output ONLY the commit message, nothing else
- One line, no period at the end
- No explanation, no bullet points, no numbering
- Example output: feat: add user authentication

<diff>
${diff}
</diff>`;
}

// CLI help text
export const HELP_TEXT = `
aicommit — AI-powered git commit message generator

Usage:
  aicommit [options]

Options:
  -m, --model <name>   Model to use (overrides saved default for this run)
  --local              Use local Ollama for this run
  --cloud              Use Ollama Cloud for this run
  --anthropic          Use Anthropic (Claude) for this run
  --setup              Re-run the setup wizard to change saved defaults
  -v, --version        Print version
  -h, --help           Show this help

Environment variables:
  ANTHROPIC_API_KEY    Use Anthropic Claude (sets provider to anthropic automatically)
  OLLAMA_API_KEY       Use Ollama Cloud (sets provider to cloud automatically)
  OLLAMA_HOST          Custom local Ollama host (default: localhost:11434)
  DEBUG=1              Print request/response debug info

Examples:
  aicommit
  aicommit --model mistral
  aicommit --anthropic --model claude-haiku-4-5-20251001
  aicommit --cloud --model devstral-2
  aicommit --setup
  ANTHROPIC_API_KEY=sk-ant-... aicommit
  OLLAMA_API_KEY=sk-... aicommit
`.trim();
