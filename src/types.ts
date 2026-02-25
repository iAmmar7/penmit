export type UserChoice = 'accept' | 'regenerate' | 'edit';

export type Provider = 'ollama' | 'anthropic';
export type OllamaMode = 'local' | 'cloud';

export interface Config {
  provider: Provider;
  ollamaMode?: OllamaMode;
  url: string;
  model: string;
  apiKey?: string;
  debug: boolean;
}

export interface ParsedArgs {
  provider?: Provider;
  ollamaMode?: OllamaMode;
  model?: string;
  help: boolean;
  version: boolean;
  setup: boolean;
}

export interface UserConfig {
  provider?: Provider;
  ollamaMode?: OllamaMode;
  model?: string;
  apiKey?: string;
}

export interface SpawnResult {
  stdout: string;
  error?: Error;
  status: number | null;
}

export type GitSpawner = (cmd: string, args: string[]) => SpawnResult;
