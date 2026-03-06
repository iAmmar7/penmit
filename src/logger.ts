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

export function colorize(color: string, text: string): string {
  return `${color}${text}${colors.reset}`;
}

export const log = {
  info(...args: unknown[]): void {
    console.log(...args);
  },
  warn(...args: unknown[]): void {
    const msg = args.map(String).join(' ');
    console.error(`${colors.yellow}${msg}${colors.reset}`);
  },
  error(...args: unknown[]): void {
    const msg = args.map(String).join(' ');
    console.error(`${colors.red}${msg}${colors.reset}`);
  },
  debug(...args: unknown[]): void {
    if (process.env.DEBUG !== '1') return;
    const msg = args.map(String).join(' ');
    console.error(`${colors.gray}${msg}${colors.reset}`);
  },
};
