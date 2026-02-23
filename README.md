# penmit

AI-powered git commit message generator that uses [Ollama](https://ollama.com) to write conventional commit messages from your staged diff — locally or via Ollama Cloud.

```text
$ git add .
$ aicommit

Provider: Local - Model: llama3.1
⠸ Generating commit message

  feat: add user authentication with JWT support

  Accept (a/Enter), Regenerate (r), Edit (e), Esc/Ctrl+C to cancel:  > _
```

## Features

- **Local-first** — runs entirely on your machine with any Ollama model, no data leaves your system
- **Cloud support** — use Ollama Cloud by setting `OLLAMA_API_KEY`; the key is stored locally on your machine and is only sent to Ollama Cloud to authenticate requests
- **Interactive prompt** — accept, regenerate, or edit the message before committing
- **Conventional commits** — output follows the `type: description` format
- **Setup wizard** — remembers your provider and model preference
- **Zero runtime dependencies** — a single binary with no `node_modules` at runtime

## Requirements

- **Node.js** >= 22
- **Ollama** (for local mode) — [install from ollama.com](https://ollama.com/download)

## Installation

```bash
npm install -g penmit
```

## Quick Start

### Local mode

1. Install and start Ollama — follow the [official Ollama installation guide](https://ollama.com/download).

2. Pull a model (browse the [Ollama library](https://ollama.com/library) for all available models):

   ```bash
   ollama pull llama3.1
   ```

3. Stage your changes and run:

   ```bash
   git add .
   aicommit
   ```

   On first run, a setup wizard walks you through picking a provider and model. Your choice is saved and reused next time.

### Cloud mode

Set your Ollama Cloud API key and run:

```bash
export OLLAMA_API_KEY=your_key_here
git add .
aicommit
```

Or pass it inline for a one-off:

```bash
OLLAMA_API_KEY=your_key aicommit
```

## Usage

```text
aicommit [options]

Options:
  -m, --model <name>   Model to use (overrides saved default for this run)
  --local              Use local Ollama for this run
  --cloud              Use Ollama Cloud for this run
  --setup              Re-run the setup wizard to change saved defaults
  -v, --version        Print version
  -h, --help           Show this help
```

### Examples

```bash
# Use your saved defaults
aicommit

# Override the model for this run only
aicommit --model mistral

# Force cloud with a specific model
aicommit --cloud --model devstral-2

# Re-run setup to switch provider or model
aicommit --setup
```

## Environment Variables

| Variable         | Description                                                        |
|------------------|--------------------------------------------------------------------|
| `OLLAMA_API_KEY` | Enables Ollama Cloud. Overrides saved provider to `cloud`.         |
| `OLLAMA_HOST`    | Custom local Ollama address (default: `localhost:11434`).          |
| `DEBUG=1`        | Print raw request/response payloads for troubleshooting.           |

## Configuration

Provider and model preferences are saved to a config file after the first interactive run:

| Platform       | Path                                  |
|----------------|---------------------------------------|
| macOS / Linux  | `~/.config/aicommit/config.json`      |
| Windows        | `%APPDATA%\aicommit\config.json`      |

To reset or change your defaults at any time:

```bash
aicommit --setup
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
git clone https://github.com/iammar7/aicommit.git
cd aicommit
npm install
npm run build
npm test
```

## License

[MIT](LICENSE)
