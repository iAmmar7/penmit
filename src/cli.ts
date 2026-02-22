import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { parseArgs, buildConfig } from "./config.js";
import { GitError, OllamaError } from "./errors.js";
import { getStagedDiff, runCommit } from "./git.js";
import { generateCommitMessage } from "./ollama.js";
import { promptUser, editMessage } from "./prompt.js";
import { createSpinner } from "./spinner.js";
import { ParsedArgs } from "./types.js";

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(__dirname, "..", "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version: string };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

const HELP_TEXT = `
aicommit — AI-powered git commit message generator

Usage:
  aicommit [options]

Options:
  -m, --model <name>   Ollama model to use (default: llama3.1)
  -v, --version        Print version
  -h, --help           Show this help

Environment variables:
  OLLAMA_API_KEY       Use Ollama Cloud instead of local Ollama
  DEBUG=1              Print request/response debug info

Examples:
  aicommit
  aicommit --model mistral
  OLLAMA_API_KEY=sk-... aicommit
`.trim();

async function generate(diff: string, config: ReturnType<typeof buildConfig>) {
  const spinner = createSpinner("Generating commit message");
  try {
    const message = await generateCommitMessage(diff, config);
    spinner.stop();
    return message;
  } catch (err) {
    spinner.stop();
    throw err;
  }
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<void> {
  let args: ParsedArgs | null = null;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  if (args.version) {
    console.log(getVersion());
    return;
  }

  const config = buildConfig(args);

  let diff: string;
  try {
    diff = getStagedDiff();
  } catch (err) {
    console.error(err instanceof GitError ? err.message : String(err));
    process.exit(1);
  }

  if (!diff.trim()) {
    console.error('No staged changes found. Stage your changes with "git add" first.');
    process.exit(1);
  }

  let message: string;
  try {
    message = await generate(diff, config);
  } catch (err) {
    console.error(err instanceof OllamaError ? err.message : String(err));
    process.exit(1);
  }

  while (true) {
    const choice = await promptUser(message);

    if (choice === "accept") {
      const status = runCommit(message);
      if (status !== 0) process.exit(status);
      break;
    } else if (choice === "regenerate") {
      console.log("Regenerating...");
      try {
        message = await generate(diff, config);
      } catch (err) {
        console.error(err instanceof OllamaError ? err.message : String(err));
        process.exit(1);
      }
    } else {
      message = await editMessage(message);
      const status = runCommit(message);
      if (status !== 0) process.exit(status);
      break;
    }
  }
}
