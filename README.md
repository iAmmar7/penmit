# penmit

> **penmit** = **pen** + com**mit** — a portmanteau for writing commit messages.

AI-powered git commit message generator that writes conventional commit messages from your staged diff. Supports [Ollama](https://ollama.com) (local and cloud), [Anthropic](https://anthropic.com), and [OpenAI](https://openai.com).

```text
$ git add .
$ penmit

Provider: Local (Ollama) - Model: llama3.2
⠸ Generating commit message

  feat: add user authentication with JWT support

  Accept (a/Enter), Regenerate (r), Edit (e), Esc/Ctrl+C to cancel:  > _
```

## Features

- **Local-first** - runs entirely on your machine with any Ollama model, no data leaves your system
- **Cloud support** - use Ollama Cloud, Anthropic (Claude), or OpenAI (Codex/GPT)
- **Interactive prompt** - accept, regenerate, or edit the message before committing
- **Conventional commits** - output follows the `type: description` format
- **Setup wizard** - remembers your provider and model preference
- **Zero runtime dependencies** - a single binary with no `node_modules` at runtime

> **Note:** The quality of the generated commit message depends entirely on the model you choose. Smaller or less capable models may produce vague, overly long, or incorrectly formatted messages. If the output looks off, try regenerating or switch to a more capable model.

## Requirements

- **Node.js** >= 22
- **Ollama** (for local mode) - [install from ollama.com](https://ollama.com/download)

## Installation

```bash
npm install -g penmit
```

## Quick Start

### Local mode (Ollama)

1. Install and start Ollama - follow the [official Ollama installation guide](https://ollama.com/download).

2. Pull a model (browse the [Ollama library](https://ollama.com/library) for all available models):

   ```bash
   ollama pull llama3.2
   ```

3. Stage your changes and run:

   ```bash
   git add .
   penmit
   ```

   On first run, a setup wizard walks you through picking a provider and model. Your choice is saved and reused next time.

### Ollama Cloud mode

Set your Ollama Cloud API key and run:

```bash
export OLLAMA_API_KEY=your_key_here
git add .
penmit
```

Or pass it inline for a one-off:

```bash
OLLAMA_API_KEY=your_key penmit
```

### Anthropic (Claude)

Set your Anthropic API key and run:

```bash
export ANTHROPIC_API_KEY=your_key_here
git add .
penmit
```

Or pass it inline:

```bash
ANTHROPIC_API_KEY=your_key penmit
```

### OpenAI (Codex / GPT)

Set your OpenAI API key and run:

```bash
export OPENAI_API_KEY=your_key_here
git add .
penmit
```

Or pass it inline:

```bash
OPENAI_API_KEY=your_key penmit
```

## Usage

```text
penmit [options]

Options:
  -m, --model <name>   Model to use (overrides saved default for this run)
  --local              Use local Ollama for this run
  --cloud              Use Ollama Cloud for this run
  --anthropic          Use Anthropic (Claude) for this run
  --openai             Use OpenAI for this run
  --setup              Re-run the setup wizard to change saved defaults
  --reset              Delete saved settings and return to defaults
  -y, --yes            Skip confirmation prompt (use with --reset)
  -v, --version        Print version
  -h, --help           Show this help
```

### Examples

```bash
# Use your saved defaults
penmit

# Override the model for this run only
penmit --model mistral

# Force Ollama Cloud with a specific model
penmit --cloud --model devstral-2

# Use Anthropic for this run
penmit --anthropic

# Use OpenAI with a specific model
penmit --openai --model gpt-4o

# Re-run setup to switch provider or model
penmit --setup

# Delete saved settings entirely
penmit --reset

# Delete saved settings without confirmation
penmit --reset --yes
```

## Environment Variables

| Variable            | Description                                                          |
|---------------------|----------------------------------------------------------------------|
| `ANTHROPIC_API_KEY` | Enables Anthropic (Claude). Overrides saved provider to `anthropic`. |
| `OPENAI_API_KEY`    | Enables OpenAI. Overrides saved provider to `openai`.                |
| `OLLAMA_API_KEY`    | Enables Ollama Cloud. Overrides saved provider to `cloud`.           |
| `OLLAMA_HOST`       | Custom local Ollama address (default: `localhost:11434`).            |
| `DEBUG=1`           | Print raw request/response payloads for troubleshooting.             |

## Configuration

Provider and model preferences are saved to a config file after the first interactive run:

| Platform       | Path                                 |
|----------------|--------------------------------------|
| macOS / Linux  | `~/.config/penmit/config.json`       |
| Windows        | `%APPDATA%\penmit\config.json`       |

To change your saved defaults, re-run the setup wizard:

```bash
penmit --setup
```

To delete your saved settings entirely and start fresh:

```bash
penmit --reset
```

## Interactive Prompt

After a commit message is generated, you are given three options:

| Key                  | Action                               |
|----------------------|--------------------------------------|
| `a` / `A` / `Enter`  | Accept and run `git commit -m "..."` |
| `r` / `R`            | Regenerate with the same model       |
| `e` / `E`            | Edit the message in a prompt         |
| `Esc` / `Ctrl+C`     | Cancel and exit                      |

## Contributing

Contributions are welcome. Please open an issue first to discuss significant changes.

```bash
git clone https://github.com/iAmmar7/penmit.git
cd penmit
npm install
npm run build
npm test
```

## License

[MIT](LICENSE)
