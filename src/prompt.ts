import * as readline from "readline";
import type { UserChoice } from "./types.js";

function cancel(): never {
  console.log("\nCancelled.");
  process.exit(0);
}

export async function promptUser(message: string): Promise<UserChoice> {
  console.log(`\nGenerated commit message:\n\n  ${message}\n`);
  process.stdout.write("Accept (a), Regenerate (r), Edit (e), Esc/Ctrl+C to cancel: ");

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

export async function editMessage(original: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  readline.emitKeypressEvents(process.stdin, rl);

  function onKey(_: string, key: readline.Key) {
    if (key?.name === "escape") {
      rl.close();
      cancel();
    }
  }
  process.stdin.on("keypress", onKey);

  const edited = await new Promise<string>((resolve) => {
    rl.question("Edit commit message (Esc to cancel):\n> ", resolve);
    rl.write(original);
  });

  process.stdin.removeListener("keypress", onKey);
  rl.close();
  return edited.trim() || original;
}
