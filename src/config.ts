import type { Config, ParsedArgs } from "./types.js";

// FIXME: LOCAL OLLAMA URL or PORT might be different for users.
export const LOCAL_OLLAMA_URL = "http://localhost:11434/api/generate";
// FIXME: CLOUD OLLAMA URL might change in the future.
export const CLOUD_OLLAMA_URL = "https://ollama.com/api/generate";
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

export function buildConfig(
  args: ParsedArgs,
  env: Record<string, string | undefined> = process.env
): Config {
  const apiKey = env.OLLAMA_API_KEY;
  const isCloud = Boolean(apiKey);

  return {
    ollamaUrl: isCloud ? CLOUD_OLLAMA_URL : LOCAL_OLLAMA_URL,
    model: args.model ?? (isCloud ? DEFAULT_CLOUD_MODEL : DEFAULT_LOCAL_MODEL),
    apiKey,
    debug: env.DEBUG === "1",
  };
}
