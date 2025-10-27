#!/bin/bash

set -euo pipefail

# Default values
IMAGE_NAME="localhost/kai-runner"
IMAGE_TAG="latest"
WORKSPACE_PATH=""
LOGS_PATH=""
ANALYZER_PATH=""
ENV_FILE=".env"
TARGETS=""
SOURCES=""
EXTRA_ARGS=""

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Run Kai Runner in a Podman container with mounted volumes.

Required:
  -w, --workspace PATH    Path to Java project workspace to analyze

Optional:
  -l, --logs PATH         Path to directory for log files (default: ./logs)
  -e, --env-file PATH     Path to environment file (default: .env)
  -i, --image NAME        Podman image name (default: kai-runner)
  -t, --tag TAG           Podman image tag (default: latest)
  --targets TARGETS       Comma-separated migration targets
  --sources SOURCES       Comma-separated migration sources
  -h, --help              Show this help message

Environment Variables (via --env-file):
  OPENAI_API_KEY          OpenAI API key
  AZURE_OPENAI_API_KEY    Azure OpenAI API key
  DEEPSEEK_API_KEY        DeepSeek API key
  GOOGLE_API_KEY          Google API key
  AWS_ACCESS_KEY_ID       AWS access key
  AWS_SECRET_ACCESS_KEY   AWS secret key
  AWS_DEFAULT_REGION      AWS default region

Examples:
  # Basic usage
  $0 -w /path/to/java/project

  # With custom logs directory and targets
  $0 -w /path/to/java/project -l /path/to/logs --targets quarkus3 --sources eap7

  # With analyzer binary
  $0 -w /path/to/java/project -a /path/to/kai-analyzer

  # With custom environment file
  $0 -w /path/to/java/project -e /path/to/custom.env

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -w|--workspace)
            WORKSPACE_PATH="$2"
            shift 2
            ;;
        -l|--logs)
            LOGS_PATH="$2"
            shift 2
            ;;
        -a|--analyzer)
            ANALYZER_PATH="$2"
            shift 2
            ;;
        -e|--env-file)
            ENV_FILE="$2"
            shift 2
            ;;
        -i|--image)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --targets)
            TARGETS="$2"
            shift 2
            ;;
        --sources)
            SOURCES="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            EXTRA_ARGS="$EXTRA_ARGS $1"
            shift
            ;;
    esac
done

# Validate required arguments
if [[ -z "$WORKSPACE_PATH" ]]; then
    echo "Error: Workspace path is required. Use -w or --workspace option."
    echo "Run '$0 --help' for usage information."
    exit 1
fi

# Validate workspace path exists
if [[ ! -d "$WORKSPACE_PATH" ]]; then
    echo "Error: Workspace path '$WORKSPACE_PATH' does not exist or is not a directory."
    exit 1
fi

# Set default logs path if not provided
if [[ -z "$LOGS_PATH" ]]; then
    LOGS_PATH="$(pwd)/logs"
fi

# Create logs directory if it doesn't exist
mkdir -p "$LOGS_PATH"

# Validate environment file exists
if [[ ! -f "$ENV_FILE" ]]; then
    echo "Warning: Environment file '$ENV_FILE' not found. Container may not have required API keys."
fi

# Validate analyzer path if provided
if [[ -n "$ANALYZER_PATH" ]] && [[ ! -f "$ANALYZER_PATH" ]]; then
    echo "Error: Analyzer binary '$ANALYZER_PATH' does not exist."
    exit 1
fi

# Build Podman command
PODMAN_CMD="podman run --rm -it"

# Add environment file
if [[ -f "$ENV_FILE" ]]; then
    PODMAN_CMD="$PODMAN_CMD --env-file $ENV_FILE"
fi

# Add volume mounts
PODMAN_CMD="$PODMAN_CMD -v $(realpath "$WORKSPACE_PATH"):/workspace"
PODMAN_CMD="$PODMAN_CMD -v $(realpath "$LOGS_PATH"):/logs"

# Add analyzer volume if provided
if [[ -n "$ANALYZER_PATH" ]]; then
    ANALYZER_DIR=$(dirname "$ANALYZER_PATH")
    ANALYZER_FILE=$(basename "$ANALYZER_PATH")
    PODMAN_CMD="$PODMAN_CMD -v $(realpath "$ANALYZER_DIR"):/analyzer"
    # Update the config to point to the mounted binary
    PODMAN_CMD="$PODMAN_CMD -e KAI_ANALYZER_PATH=/analyzer/$ANALYZER_FILE"
fi

# Add image
PODMAN_CMD="$PODMAN_CMD ${IMAGE_NAME}:${IMAGE_TAG}"

# Add targets and sources if provided
if [[ -n "$TARGETS" ]]; then
    PODMAN_CMD="$PODMAN_CMD --targets $TARGETS"
fi

if [[ -n "$SOURCES" ]]; then
    PODMAN_CMD="$PODMAN_CMD --sources $SOURCES"
fi

# Add any extra arguments
if [[ -n "$EXTRA_ARGS" ]]; then
    PODMAN_CMD="$PODMAN_CMD $EXTRA_ARGS"
fi

# Print the command being executed
echo "Executing: $PODMAN_CMD"
echo ""

# Run the container
eval $PODMAN_CMD