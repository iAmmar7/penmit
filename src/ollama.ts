import type { Config } from "./types.js";
import { OllamaError } from "./errors.js";

const SYSTEM_PROMPT =
  "You are a git commit message generator. Output ONLY the commit message line — no explanation, no description, no bullet points, no markdown, no preamble.";

function getUserPrompt(diff: string): string {
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


export async function generateCommitMessage(
  diff: string,
  config: Config,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<string> {
  const body = {
    model: config.model,
    system: SYSTEM_PROMPT,
    prompt: getUserPrompt(diff),
    stream: false,
  };

  if (config.debug) {
    console.error("\n[DEBUG] Request body:\n", JSON.stringify(body, null, 2));
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetchFn(config.ollamaUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new OllamaError(
      `Could not connect to Ollama: ${msg}. Make sure it is running with: ollama serve`
    );
  }

  if (!response.ok) {
    throw new OllamaError(
      `Ollama returned an error: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as { response: string };

  if (config.debug) {
    console.error("\n[DEBUG] Raw response:\n", JSON.stringify(data, null, 2));
  }

  return data.response.trim();
}
