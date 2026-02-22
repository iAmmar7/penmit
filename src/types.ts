export type UserChoice = "accept" | "regenerate" | "edit";

export interface Config {
  ollamaUrl: string;
  model: string;
  apiKey?: string;
  debug: boolean;
}

export interface ParsedArgs {
  model?: string;
  help: boolean;
  version: boolean;
}

export interface SpawnResult {
  stdout: string;
  error?: Error;
  status: number | null;
}

export type GitSpawner = (cmd: string, args: string[]) => SpawnResult;
