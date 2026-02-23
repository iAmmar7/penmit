export type UserChoice = "accept" | "regenerate" | "edit";

export type Provider = 'local' | 'cloud';

export interface Config {
  ollamaUrl: string;
  model: string;
  apiKey?: string;
  debug: boolean;
  provider: Provider;
}

export interface ParsedArgs {
  model?: string;
  provider?: Provider;
  help: boolean;
  version: boolean;
  setup: boolean;
}

export interface UserConfig {
  provider?: Provider;
  model?: string;
  apiKey?: string;
}

export interface SpawnResult {
  stdout: string;
  error?: Error;
  status: number | null;
}

export type GitSpawner = (cmd: string, args: string[]) => SpawnResult;
