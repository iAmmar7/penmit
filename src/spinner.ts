import { colors } from './logger.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface Spinner {
  stop(finalMessage?: string): void;
}

export function createSpinner(text: string): Spinner {
  if (!process.stdout.isTTY) {
    process.stdout.write(`${text}...\n`);
    return {
      stop(finalMessage?: string) {
        if (finalMessage) process.stdout.write(`${finalMessage}\n`);
      },
    };
  }

  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${FRAMES[i % FRAMES.length]} ${text}`);
    i++;
  }, 80);

  return {
    stop(finalMessage?: string) {
      clearInterval(interval);
      process.stdout.write(`\r${colors.clearLine}`);
      if (finalMessage) process.stdout.write(`${finalMessage}\n`);
    },
  };
}
