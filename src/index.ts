import { spawnSync } from "child_process";
import * as readline from "readline";

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "llama3.1";

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

function getStagedDiff(): string {
  const result = spawnSync("git", ["diff", "--staged"], { encoding: "utf8" });
  if (result.error) {
    console.error("Error running git diff --staged:", result.error.message);
    process.exit(1);
  }
  return result.stdout;
}

async function generateCommitMessage(diff: string): Promise<string> {
  const debug = process.env.DEBUG === "1";
  const body = {
    model: MODEL,
    system: SYSTEM_PROMPT,
    prompt: getUserPrompt(diff),
    stream: false,
  };

  if (debug) {
    console.error("\n[DEBUG] Request body:\n", JSON.stringify(body, null, 2));
  }

  let response: Response;
  try {
    response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    console.error(
      "Could not connect to Ollama. Make sure it is running with: ollama serve"
    );
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`Ollama returned an error: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const data = (await response.json()) as { response: string };

  if (debug) {
    console.error("\n[DEBUG] Raw response:\n", JSON.stringify(data, null, 2));
  }

  return data.response.trim();
}

function cancel(): never {
  console.log("\nCancelled.");
  process.exit(0);
}

async function promptUser(message: string): Promise<"accept" | "regenerate" | "edit"> {
  console.log(`\nGenerated commit message:\n\n  ${message}\n`);
  process.stdout.write("Accept (a), Regenerate (r), Edit (e), Esc to cancel: ");

  return new Promise((resolve) => {
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    function cleanup() {
      process.stdin.removeListener("keypress", onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    function onKey(_: string, key: readline.Key) {
      if (!key) return;
      const name = key.name?.toLowerCase();

      if (name === "escape" || (key.ctrl && name === "c")) {
        cleanup();
        cancel();
      }

      if (name === "a") {
        process.stdout.write("a\n");
        cleanup();
        resolve("accept");
      } else if (name === "r") {
        process.stdout.write("r\n");
        cleanup();
        resolve("regenerate");
      } else if (name === "e") {
        process.stdout.write("e\n");
        cleanup();
        resolve("edit");
      }
    }

    process.stdin.on("keypress", onKey);
  });
}

async function editMessage(original: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  readline.emitKeypressEvents(process.stdin, rl);

  function onKey(_: string, key: readline.Key) {
    if (key?.name === "escape") {
      rl.close();
      cancel();
    }
  }
  process.stdin.on("keypress", onKey);

  const edited = await new Promise<string>((resolve) =>
    rl.question(`Edit commit message (Enter to keep, Esc to cancel):\n  ${original}\n> `, resolve)
  );

  process.stdin.removeListener("keypress", onKey);
  rl.close();
  return edited.trim() || original;
}

function runCommit(message: string): void {
  const result = spawnSync("git", ["commit", "-m", message], {
    stdio: "inherit",
    encoding: "utf8",
  });
  if (result.error) {
    console.error("Failed to run git commit:", result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main(): Promise<void> {
  const diff = getStagedDiff();

  if (!diff || diff.trim() === "") {
    console.error(
      "No staged changes found. Stage your changes with `git add` first."
    );
    process.exit(1);
  }

  let message = await generateCommitMessage(diff);

  while (true) {
    const choice = await promptUser(message);

    if (choice === "accept") {
      runCommit(message);
      break;
    } else if (choice === "regenerate") {
      console.log("Regenerating...");
      message = await generateCommitMessage(diff);
    } else if (choice === "edit") {
      message = await editMessage(message);
      runCommit(message);
      break;
    }
  }
}

main();
