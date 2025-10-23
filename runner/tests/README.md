# Running Tests

## Prerequisites

Before the tests in this directory, you need to set up the following environment variables depending on which providers you are testing.

### Java Provider

Following variables are required to run all tests that use the _javaDiagnosticsProvider_:

- `JDTLS_BINARY_PATH`: Path to the JDTLS binary executable
- `WORKSPACE_PATHS`: Comma-separated list of Java workspace/project paths to analyze
- `JDTLS_BUNDLES`: Comma-separated list of additional JAR bundle paths for JDTLS

Optional variables:

- `JVM_MAX_MEM`: Maximum JVM memory allocation (e.g., "4g", "2048m")

## Setup Example

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your actual paths
export JDTLS_BINARY_PATH="/usr/local/bin/jdtls"
export WORKSPACE_PATHS="/path/to/your/java/project"
export JVM_MAX_MEM="2g"
```

## Running Tests

```bash
npm test
```