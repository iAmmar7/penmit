import type { Config, ParsedArgs } from "./types.js";

export const OLLAMA_API_PATH = "/api/generate";
export const LOCAL_OLLAMA_URL = `http://localhost:11434${OLLAMA_API_PATH}`;
// FIXME: CLOUD OLLAMA URL might change in the future.
export const CLOUD_OLLAMA_URL = `https://ollama.com${OLLAMA_API_PATH}`;
// FIXME: Default model can be the first model that is listed by `ollama list` command. 
// Or does Ollama has a concept of "default" model?
export const DEFAULT_LOCAL_MODEL = "llama3.1";
export const DEFAULT_CLOUD_MODEL = "devstral-2";

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { help: false, version: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case "--help":
      case "-h":
        result.help = true;
        break;
      case "--version":
      case "-v":
        result.version = true;
        break;
      case "--model":
      case "-m": {
        const next = argv[i + 1];
        if (!next || next.startsWith("-")) {
          throw new Error(`${arg} requires a model name (e.g. --model mistral)`);
        }
        result.model = next;
        i++;
        break;
      }
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return result;
}

// OLLAMA_HOST is Ollama's own env var for configuring the server address.
// The Ollama client (ollama run, ollama pull, etc.) also reads it to know where to connect.
// Ref: https://github.com/ollama/ollama/blob/main/api/client.go
function buildLocalUrl(env: Record<string, string | undefined>): string {
  const host = env.OLLAMA_HOST;
  if (!host) return LOCAL_OLLAMA_URL;

  const base = host.includes("://") ? host : `http://${host}`;
  const url = new URL(base);

  // If user provided a custom path, use the URL as-is
  if (url.pathname !== "/") return base.replace(/\/$/, "");

  // Otherwise append the standard Ollama path
  return `${base.replace(/\/$/, "")}${OLLAMA_API_PATH}`;
}

export function buildConfig(
  args: ParsedArgs,
  env: Record<string, string | undefined> = process.env
): Config {
  const apiKey = env.OLLAMA_API_KEY;
  const isCloud = Boolean(apiKey);

  return {
    ollamaUrl: isCloud ? CLOUD_OLLAMA_URL : buildLocalUrl(env),
    model: args.model ?? (isCloud ? DEFAULT_CLOUD_MODEL : DEFAULT_LOCAL_MODEL),
    apiKey,
    debug: env.DEBUG === "1",
  };
}
