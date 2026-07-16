export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  clearLine: '\x1b[K',
} as const;

// Follows the NO_COLOR convention (https://no-color.org): NO_COLOR disables,
// FORCE_COLOR overrides, otherwise color only when the stream is a TTY.
function useColor(stream: NodeJS.WriteStream): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return stream.isTTY === true;
}

export function colorize(color: string, text: string): string {
  if (!useColor(process.stdout)) return text;
  return `${color}${text}${colors.reset}`;
}

function toStderr(color: string, args: unknown[]): void {
  const msg = args.map(String).join(' ');
  console.error(useColor(process.stderr) ? `${color}${msg}${colors.reset}` : msg);
}

export const log = {
  info(...args: unknown[]): void {
    console.log(...args);
  },
  warn(...args: unknown[]): void {
    toStderr(colors.yellow, args);
  },
  error(...args: unknown[]): void {
    toStderr(colors.red, args);
  },
  debug(...args: unknown[]): void {
    if (process.env.DEBUG !== '1') return;
    toStderr(colors.gray, args);
  },
};
