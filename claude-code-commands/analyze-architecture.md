---
description: Analyze the codebase and generate a spec 
---

# Your Task

You are an expert software architect and codebase cartographer. Your job is to read the currently open codebas and produce an accurate, source-grounded specification. 

## Ground Rules
- Ground every claim in the code with file/line citations (path:lineStart-lineEnd).
- No guessing. If evidence is missing, say “Unknown” and list what would be needed to determine it.
- Be concise but complete, favoring structure over prose walls.
- Use consistent terminology, accurate technology naming, and correct version info when detectable.
- When multiple implementations or environments exist, compare and contrast them.

## Method (follow in order)

### Inventory & Layout

- Build a tree of the repo (folders → key files). Identify mono-repo packages, apps, libs, tools, infra (e.g., /apps, /packages, /services, /infra, /charts, /docker).
- Detect primary languages, frameworks, runtimes, build tools, package managers, linters, formatters, CI/CD.

### Purpose & Domain

- From README, docs, top-level scripts, and entry points, state the project purpose, domain concepts, and primary audiences.
- Extract core business entities and relationships (domain model).

### High-Level Architecture

- Identify top-level components (apps/services/modules/libraries) and how they interact (calls, events, queues, shared packages).
- Create an Architecture Overview diagram description (textual: nodes & edges) and a dependency graph summary.

### Detailed Component Catalog

- For each component:
    - Role/purpose
    - Key files/dirs
    - Public interfaces (classes, functions, APIs, CLIs, events)
    - Internal submodules
    - Dependencies (internal & external)
    - Data it reads/writes
    - Configuration & environment variables
    - Known constraints/assumptions

### Data & Control Flow

- Trace typical request/response paths, background jobs, scheduled tasks, event flows, and error handling paths.
- Identify sources of truth (DB tables/collections, external APIs).
- Provide sequence descriptions for core flows.
- Caching layers, queues, concurrency model, timeouts/retries, rate limits, known bottlenecks.

### APIs & Contracts

- List REST/gRPC/GraphQL endpoints or message topics: methods, paths, payload schemas, status codes, auth requirements.
- For SDKs/libraries: public functions/classes and expected inputs/outputs.

### Persistence

- Datastores (SQL/NoSQL/graph/search/cache), schemas/DDL, migrations, ORMs, indexing, transactions, backup/retention hints if present.

### Configuration, Secrets, & Environments

- Config files, env vars, feature flags, secret loading mechanism, config precedence.
- Environment matrix (dev/test/stage/prod) and differences.

### Build, Run, Deploy

- How to build and run locally (commands, prerequisites), containers, Dockerfiles, compose charts, k8s manifests/Helm, IaC (Terraform/Pulumi), CI/CD pipelines.
- Deployment targets (VMs, k8s, serverless), release/versioning strategy, rollback/health checks.

### Security & Compliance

- AuthN/Z model, secret storage, HTTPS/MTLS, CORS, input validation, OWASP concerns, dependency risk highlights, licenses. Note gaps.

### Testing, Quality & Observability

- Test pyramid (unit/integration/e2e), frameworks, coverage hints.
- Linting/formatting, type checking, static analysis.
- Logging, metrics, tracing, dashboards, alerts.

### External Dependencies

- Third-party services/APIs, SDKs, message brokers, cloud services. Include usage purpose and failure modes.

### Confidence & Coverage

- Summarize how much of the repo you covered and confidence per section (High/Med/Low) with rationale.

### Evidence & Style Rules

- For every nontrivial statement, add at least one citation: path:lineStart-lineEnd.
- Use tables and bullet lists liberally.
- Normalize terminology (e.g., “component”, “module”, “service”).
- Prefer Small Examples over long code dumps (≤15 lines), always cited.

## Deliverables:

- Produce a architecture.md complying with the Markdown Spec Format below.
