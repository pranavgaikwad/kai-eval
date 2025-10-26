# Kai Runner

A TypeScript-based CLI tool for AI-driven code migration and analysis. Kai Runner orchestrates task providers to analyze Java codebases, detect migration issues, and generate automated fixes using large language models.

## Quick Start

### Using Container (Recommended)

```bash
# Clone repository
git clone <repo_url>
cd runner

# Build container
podman build -t localhost/kai-runner:latest .

# Run on Java project
./scripts/run-container.sh -w /path/to/java/project --targets quarkus3 --sources eap7
```

### Local Development

```bash
# Pull in your local editor-extensions/agentic dep
# Ensure PATH_EDITOR_EXTENSIONS env is set
npm run build-deps

# Install dependencies
npm install
npm run build

# Configure environment
cp .env.example .env
cp .config.json.example .config.json
# Edit files with your settings

# Run CLI
./dist/main.js -c .config.json
```

## Prerequisites

### Container Usage

- Podman or Docker

### Local Development

- Node.js >= 20
- Java 21+
- JDTLS (Java Language Server)
- Kai analyzer RPC binary (optional)

## Project Structure

- `src/main.ts` - CLI entry point for standalone mode
- `src/kai/` - Kai workflow manager and model provider abstractions
- `src/taskManager/` - Core task orchestration and management
- `src/taskProviders/` - Pluggable providers (Java diagnostics, analysis)
- `src/utils/` - Configuration loading, logging, file system utilities
- `tests/` - Jest tests with Java project test data
- `vendor/` - Vendored dependencies

## Configuration

Configuration precedence: CLI args > JSON config file > environment variables

### Key Settings

| Setting | Description | Example |
|---------|-------------|---------|
| `workspacePaths` | Java projects to analyze | `["/path/to/project"]` |
| `modelProvider` | LLM provider | `"ChatOpenAI"` |
| `jdtlsBinaryPath` | JDTLS executable path | `"/path/to/jdtls/bin/jdtls"` |
| `targets` | Migration targets | `["quarkus3"]` |
| `sources` | Migration sources | `["eap7"]` |
| `rulesPath` | Rule file paths | `["/path/to/rules"]` |

### Environment Variables

Required API keys (set one):
- `OPENAI_API_KEY` - OpenAI API key
- `AZURE_OPENAI_API_KEY` - Azure OpenAI key
- `GOOGLE_API_KEY` - Google Gemini key
- `DEEPSEEK_API_KEY` - DeepSeek key
- `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_DEFAULT_REGION` - AWS Bedrock

## Usage

### Container Deployment

```bash
# Basic usage
./scripts/run-container.sh -w /path/to/java/project

# With migration parameters
./scripts/run-container.sh -w /path/to/project --targets quarkus3 --sources eap7

# With custom logs and analyzer
./scripts/run-container.sh -w /path/to/project -l ./logs -a /path/to/kai-analyzer

# Show all options
./scripts/run-container.sh --help
```

### Local CLI

```bash
# Basic execution
node dist/main.js -c .config.json

# With overrides
node dist/main.js -c .config.json --log-level debug --targets quarkus3

# Show help
node dist/main.js --help
```

### CLI Options

- `-c, --config <path>` - Required JSON configuration file
- `--workspace-paths <paths>` - Comma-separated workspace paths
- `--model-provider <provider>` - AI model provider
- `--log-level <level>` - Log verbosity (error|warn|info|debug|silly)
- `--targets <targets>` - Migration target frameworks
- `--sources <sources>` - Migration source frameworks
- `--jdtls-binary-path <path>` - Java Language Server binary
- `--jvm-max-mem <memory>` - JVM memory limit (e.g., 4g)
- `--rules-path <paths>` - Migration rule files

## Development

### Local Setup

```bash
# Install and build
npm install
npm run build

# Development with hot reload
npm run dev

# Run in development
node dist/main.js -c .config.json
```

### Testing

```bash
# Run all tests
npm test

# Specific test
npm test -- tests/javaDiagnostics.test.ts

# With coverage
npm test -- --coverage

# Linting
npm run lint
npm run lint:fix
```

### Container Development

```bash
# Build image
podman build -t localhost/kai-runner:latest .

# Test container
./scripts/run-container.sh -w tests/test-data/java
```

## Architecture

Kai Runner uses a provider-based architecture where task providers (Java diagnostics via JDTLS, code analysis via Kai analyzer) are managed through TaskManager and coordinated with AI workflows via KaiWorkflowManager.

**Key Dependencies:**
- `@langchain/*` - Multi-provider LLM integration
- `commander` - CLI argument parsing
- `winston` - Structured logging
- `chokidar` - File system watching
- `vscode-jsonrpc` - Language Server Protocol communication

## Troubleshooting

- **Module resolution errors**: Run `npm run build` to ensure compilation
- **JDTLS failures**: Verify `jdtlsBinaryPath` and `JAVA_HOME` settings
- **Memory issues**: Increase `jvmMaxMem` setting (default: 4g)
- **Missing API keys**: Check environment variables for your model provider
- **Container mount issues**: Ensure workspace path exists and is readable
- **File watching limits**: On Linux, increase `fs.inotify.max_user_watches`

## Contributing

1. Fork the repository
2. Create feature branch: `feature/description` or `fix/description`
3. Follow conventional commit format
4. Add tests for new functionality
5. Run linting: `npm run lint:fix`
6. Submit pull request

**Adding New Components:**
- Task providers: `src/taskProviders/`
- Model providers: `src/kai/modelProvider.ts`
- Configuration: Update `src/types.ts`

## License

[License information]

## Support

For issues and questions, please use the GitHub issue tracker.