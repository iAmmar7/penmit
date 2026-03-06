export type UserChoice = 'accept' | 'regenerate' | 'edit';

export type Provider = 'ollama' | 'anthropic' | 'openai';
export type OllamaMode = 'local' | 'cloud';

export interface Config {
  provider: Provider;
  ollamaMode?: OllamaMode;
  url: string;
  model: string;
  apiKey?: string;
  maxLength: number;
}

export interface ParsedArgs {
  provider?: Provider;
  ollamaMode?: OllamaMode;
  model?: string;
  maxLength?: number;
  help: boolean;
  version: boolean;
  setup: boolean;
  reset: boolean;
  yes: boolean;
}

export interface UserConfig {
  provider?: Provider;
  ollamaMode?: OllamaMode;
  model?: string;
  apiKey?: string;
  maxLength?: number;
}

export interface SpawnResult {
  stdout: string;
  error?: Error;
  status: number | null;
}

export type GitSpawner = (cmd: string, args: string[]) => SpawnResult;
