export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

export class LLMError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
  }
}

export class OllamaError extends LLMError {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaError';
  }
}

export class AnthropicError extends LLMError {
  constructor(message: string) {
    super(message);
    this.name = 'AnthropicError';
  }
}
