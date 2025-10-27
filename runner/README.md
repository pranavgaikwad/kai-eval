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

This project depends on `@editor-extensions/agentic` and `@editor-extensions/shared` as packages. They are vendored in as local deps and need to be built prior to building this project. The `npm run pre-build` command builds these deps off of `main` branch of [editor-extensions](https://github.com/konveyor/editor-extensions). This is triggered in `npm run build` command as well. You can set `PATH_EDITOR_EXTENSIONS` in `.env` file to use a local editor extensions repo instead.

To build the project:

```bash
# Build the project
# This will also pull in and build the editor-extensions packages needed
npm run build
```

To run the project, you will also need to setup some runtime dependencies needed for analysis such as JDTLS, Java Bundle, rulesets, etc. Run `npm run pre-run` command to pull in these dependencies. Either podman or docker is needed to run _pre-run_ command. The configuration for these dependencies is done in `.config.json` file. The example `.config.json.example` file already comes pre-configured with paths from `npm run pre-run` command. You can copy it to `.config.json` as-is. See [Configuration](#configuration) for more information on runtime configuration.


```sh
# Setup dependencies at paths in .config.json.example
npm run pre-run

# Run tests
npm test

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

See [types.ts](./src/types.ts).

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