import * as readline from "readline";
import type { UserChoice } from "./types.js";

function cancel(): never {
  console.log("\nCancelled.");
  process.exit(0);
}

export interface SelectItem<T> {
  label: string;
  value: T;
  hint?: string;
}

export async function selectFromList<T>(
  question: string,
  items: SelectItem<T>[],
): Promise<T> {
  // Non-interactive fallback (e.g. CI / piped input)
  // TODO: consider a more robust non-interactive mode (e.g. env var override or CLI arg) instead of silently picking the first item
  if (!process.stdin.isTTY) {
    process.stdout.write(`${question} ${items[0].label}\n`);
    return items[0].value;
  }

  let selected = 0;
  const totalLines = items.length + 1; // 1 question line + N item lines

  function render(isFirst: boolean): void {
    if (!isFirst) {
      process.stdout.write(`\x1b[${totalLines}A`);
    }
    process.stdout.write(`\r\x1b[K${question}\n`);
    for (let i = 0; i < items.length; i++) {
      const isCurrent = i === selected;
      const cursor = isCurrent ? '\x1b[36m❯\x1b[0m' : ' ';
      const label = isCurrent
        ? `\x1b[1m${items[i].label}\x1b[0m`
        : items[i].label;
      const hint = items[i].hint ? `  \x1b[2m— ${items[i].hint}\x1b[0m` : '';
      process.stdout.write(`\r\x1b[K  ${cursor} ${label}${hint}\n`);
    }
  }

  return new Promise((resolve) => {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdout.write('\x1b[?25l'); // hide cursor

    render(true);

    function cleanup(): void {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\x1b[?25h'); // show cursor
    }

    function onKey(_: string, key: readline.Key): void {
      if (!key) return;

      if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
        cleanup();
        cancel();
      }

      if (key.name === 'up') {
        selected = (selected - 1 + items.length) % items.length;
        render(false);
      } else if (key.name === 'down') {
        selected = (selected + 1) % items.length;
        render(false);
      } else if (key.name === 'return') {
        const chosen = items[selected];
        cleanup();
        // Collapse menu to a single summary line
        process.stdout.write(`\x1b[${totalLines}A`);
        process.stdout.write(
          `\r\x1b[K${question} \x1b[36m${chosen.label}\x1b[0m\n`,
        );
        for (let i = 0; i < items.length; i++) {
          process.stdout.write(`\r\x1b[K\n`);
        }
        process.stdout.write(`\x1b[${items.length}A`);
        resolve(chosen.value);
      }
    }

    process.stdin.on('keypress', onKey);
  });
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

export async function promptInput(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise<string>((resolve) =>
    rl.question(question, resolve),
  );
  rl.close();
  return answer.trim();
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
