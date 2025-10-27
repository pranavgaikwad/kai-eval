# Kai Runner

A TypeScript-based CLI tool for AI-driven code migration and analysis. Kai Runner orchestrates task providers to analyze Java codebases, detect migration issues, and generate automated fixes using large language models.

Two entrypoints:
- **Generation**: CLI to generate Kai fixes
- **Evaluation**: CLI to generate and evaluate Kai fixes (InProgress...)

## Index

- [Setup](#setup)
  - [Container Setup](#container-setup)
  - [Development Setup](#development-setup)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
- [Developer Overview](#developer-overview)

## Setup

### Container Setup

Container setup allows running the entrypoints in a container with all dependencies pre-installed and configured. This will run the standalone CLI in the container using configuration from `.config.container.json` which is pre-configured for the container.

**Build the container image:**
```bash
podman build -t localhost/kai-runner:latest .
```

There are scripts available to run the container for each of the entrypoints.

To generate Kai fixes, run:

```bash
./scripts/run-kai-fix-container.sh -w /path/to/java/project --targets quarkus,cloud-readiness
```

**Available options for run-kai-fix-container.sh:**

- `-w, --workspace PATH` - Required: Path to Java project workspace to analyze
- `-l, --logs PATH` - Path to directory for log files (default: ./logs)
- `-e, --env-file PATH` - Path to environment file (default: .env)
- `-i, --image NAME` - Podman image name (default: kai-runner)
- `-t, --tag TAG` - Podman image tag (default: latest)
- `--targets TARGETS` - Comma-separated migration targets
- `--sources SOURCES` - Comma-separated migration sources
- `-a, --analyzer PATH` - Path to optional Kai analyzer binary
- `-h, --help` - Show help message

**Examples:**
```bash
# Basic usage
./scripts/run-kai-fix-container.sh -w /path/to/java/project

# With migration parameters
./scripts/run-kai-fix-container.sh -w /path/to/project --targets quarkus3 --sources eap7

# With custom logs and analyzer
./scripts/run-kai-fix-container.sh -w /path/to/project -l ./logs -a /path/to/kai-analyzer
```

See [Configuration](#configuration) for more details on the configuration file and environment variables.

### Development Setup

For development, copy `.config.json.example` to `.config.json` and edit the file with your settings. Dependencies can be downloaded using `npm run build-deps` which will be downloaded into the `vendor` directory. The `.config.json.example` file contains paths to these dependencies already. 

You will need to configure environment variables. See [Configuration](#configuration) for more details on the configuration file and environment variables.

> `@editor-extensions/agentic" is used as a dependency which is vendored in as a local dep. `npm run build-deps` downloads it already, you can use a local one by setting `PATH_EDITOR_EXTENSIONS` environment variable.

**Build the project and run tests:**
```bash
# [REQUIRED] Setup editor-extensions and other deps
npm run build-deps

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Development with hot reload
npm run dev

# Run the CLI
node dist/main.js -c .config.json
```

## Configuration

Configuration precedence: CLI arguments > JSON configuration file > environment variables

| Setting | Type | Description |
|---------|------|-------------|
| `workspacePaths` | string[] | Java project paths to analyze |
| `modelProvider` | string | LLM provider (ChatOpenAI, ChatGoogleGenerativeAI, etc.) |
| `modelArgs` | object | Provider-specific model configuration |
| `jdtlsBinaryPath` | string | Path to JDTLS (Java Language Server) executable |
| `jdtlsBundles` | string[] | Additional JDTLS bundle JAR files |
| `jvmMaxMem` | string | Maximum JVM memory allocation (e.g., "4g") |
| `kaiAnalyzerRpcPath` | string | Path to Kai analyzer RPC binary (optional) |
| `rulesPaths` | string[] | Migration rule files and directories |
| `targets` | string[] | Migration target frameworks (quarkus3, etc.) |
| `sources` | string[] | Migration source frameworks (eap7, etc.) |
| `solutionServerUrl` | string | Solution server endpoint URL |
| `logLevel` | object | Console and file logging levels |
| `logDir` | string | Directory for log files |

### Environment Variables

Read the `.env.example` file and set the environment variables in the `.env` file.

**Required API keys (set at least one):**
- `OPENAI_API_KEY` - OpenAI API key for GPT models
- `AZURE_OPENAI_API_KEY` - Azure OpenAI API key
- `DEEPSEEK_API_KEY` - DeepSeek API key
- `GOOGLE_API_KEY` - Google API key for Gemini models
- `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `AWS_DEFAULT_REGION` - AWS credentials for Bedrock

**Development dependencies:**
- `PATH_EDITOR_EXTENSIONS` - Path to your local editor-extensions repo (needed for build-deps)

**Optional:**
- `JAVA_HOME` - Java installation path (if not in system PATH)

## Developer Overview

### Components

- **CLI** - Command-line interface for parsing arguments and orchestrating the application [main.ts](src/main.ts)
- **Java Diagnostics Task Provider** - Provides Java diagnostics using JDTLS language server integration [javaDiagnosticsTasksProvider.ts](src/taskProviders/javaDiagnosticsTasksProvider.ts)
- **Analysis Tasks Provider** - Handles code analysis tasks using Kai analyzer RPC [analysisTasksProvider.ts](src/taskProviders/analysisTasksProvider.ts)
- **Task Provider API** - Interface defining task creation, initialization, and lifecycle management [taskProvider.ts](src/taskProviders/types/taskProvider.ts)
- **Task Manager API** - Interface for coordinating task providers and managing task snapshots [types.ts](src/taskManager/types.ts)
- **Task Manager Implementation** - Core orchestration engine that coordinates multiple task providers [taskManager.ts](src/taskManager/taskManager.ts)
  - **Process Manager** - Manages external process lifecycle and communication [processManager.ts](src/taskProviders/managers/processManager.ts)
  - **Diagnostics Manager** - Stores and manages diagnostic tasks with generic data handling [diagnosticsManager.ts](src/taskProviders/managers/diagnosticsManager.ts)
  - **RPC Connection Manager** - Handles RPC connections to external services like Kai analyzer [rpcConnectionManager.ts](src/taskProviders/managers/rpcConnectionManager.ts)
- **Kai Workflow Manager** - Orchestrates AI-driven workflows and model provider interactions [kaiWorkflowManager.ts](src/kai/kaiWorkflowManager.ts)

### Relationships

- **CLI** loads configuration and initializes all components, then delegates to Task Manager for execution
- **Task Manager** coordinates both Task Providers, collecting tasks and managing snapshots for analysis
- **Java Diagnostics Provider** uses Process Manager and Diagnostics Manager for JDTLS communication and task storage
- **Analysis Tasks Provider** leverages RPC Connection Manager to communicate with external Kai analyzer services
- **Task Providers** implement the Task Provider API, allowing Task Manager to treat them uniformly
- **Kai Workflow Manager** receives tasks from Task Manager and orchestrates AI model interactions for code migration
- **Internal Managers** (Process, Diagnostics, RPC) provide specialized services to Task Providers for external communication and data management