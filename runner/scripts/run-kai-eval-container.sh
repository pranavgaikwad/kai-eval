#!/bin/bash

set -euo pipefail

# Default values
IMAGE_NAME="localhost/kai-runner"
CONFIG_PATH=".config.container.json"
IMAGE_TAG="latest"
TEST_PATHS=""
OUTPUT_DIR=""
ARTIFACTS_PATH=""
ENV_FILE=""
TEST_SELECTORS=""
EXTRA_ARGS=""

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Run Kai Evaluation in a Podman container with mounted volumes.

Required:
  -e, --env-file PATH     Path to environment file
  -t, --test-paths PATHS  Comma-separated paths to test directories

Optional:
  -c, --config PATH       Path to JSON configuration file (default: .config.container.json)
  --output-dir PATH       Path to directory for output files (default: ./eval-results)
  --artifacts-path PATH   Path to directory for evaluation artifacts (not mounted by default)
  --test-selectors LIST   Comma-separated test selectors in format <app_name>#<test_name>,...
  -i, --image NAME        Podman image name (default: localhost/kai-runner)
  -t, --tag TAG           Podman image tag (default: latest)
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
  $0 -e .env -c .config.container.json -t tests/test-data/evalData/coolstore/test_cases

  # With specific test selectors and output directory
  $0 -e .env -c .config.container.json -t tests/test-data/evalData --output-dir ./results --test-selectors "coolstore#remote-ejb-to-rest,coolstore#jms-to-smallrye"

  # With artifacts directory mounting
  $0 -e .env -c .config.container.json -t tests/test-data/evalData --artifacts-path ./artifacts --output-dir ./results

  # With environment file
  $0 -e .env -c .config.container.json -t tests/test-data/evalData --output-dir ./results

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--config)
            CONFIG_PATH="$2"
            shift 2
            ;;
        -t|--test-paths)
            TEST_PATHS="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        --artifacts-path)
            ARTIFACTS_PATH="$2"
            shift 2
            ;;
        --test-selectors)
            TEST_SELECTORS="$2"
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
        --tag)
            IMAGE_TAG="$2"
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
if [[ -z "$CONFIG_PATH" ]]; then
    echo "Error: Configuration file path is required. Use -c or --config option."
    echo "Run '$0 --help' for usage information."
    exit 1
fi

if [[ -z "$ENV_FILE" ]] && [[ ! -f "$ENV_FILE" ]]; then
    echo "Error: Environment file '$ENV_FILE' does not exist. Use -e or --env-file option and provide a valid path."
    echo "Run '$0 --help' for usage information."
    exit 1
fi

if [[ -z "$TEST_PATHS" ]]; then
    echo "Error: Test paths are required. Use -t or --test-paths option."
    echo "Run '$0 --help' for usage information."
    exit 1
fi

# Validate config file exists
if [[ ! -f "$CONFIG_PATH" ]]; then
    echo "Error: Configuration file '$CONFIG_PATH' does not exist."
    exit 1
fi

# Validate test paths exist
IFS=',' read -ra TEST_PATH_ARRAY <<< "$TEST_PATHS"
for test_path in "${TEST_PATH_ARRAY[@]}"; do
    test_path=$(echo "$test_path" | xargs)  # Trim whitespace
    if [[ ! -d "$test_path" ]]; then
        echo "Error: Test path '$test_path' does not exist or is not a directory."
        exit 1
    fi
done

# Set default output directory if not provided
if [[ -z "$OUTPUT_DIR" ]]; then
    OUTPUT_DIR="$(pwd)/eval-results"
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Validate environment file exists if provided
if [[ -n "$ENV_FILE" ]] && [[ ! -f "$ENV_FILE" ]]; then
    echo "Warning: Environment file '$ENV_FILE' not found. Container may not have required API keys."
fi

# Validate artifacts path if provided
if [[ -n "$ARTIFACTS_PATH" ]] && [[ ! -d "$ARTIFACTS_PATH" ]]; then
    echo "Error: Artifacts path '$ARTIFACTS_PATH' does not exist or is not a directory."
    exit 1
fi

# Build Podman command
PODMAN_CMD="podman run -it"

# Add environment file if provided
if [[ -n "$ENV_FILE" ]] && [[ -f "$ENV_FILE" ]]; then
    PODMAN_CMD="$PODMAN_CMD --env-file $ENV_FILE"
fi



# Add volume mounts
PODMAN_CMD="$PODMAN_CMD -v $(realpath "$CONFIG_PATH"):/config/config.json:Z"
PODMAN_CMD="$PODMAN_CMD -v $(realpath "$OUTPUT_DIR"):/output:Z,U"

# Mount test paths - determine if single path or multiple paths
if [[ "${#TEST_PATH_ARRAY[@]}" -eq 1 ]]; then
    # Single test path - mount directly
    PODMAN_CMD="$PODMAN_CMD -v $(realpath "${TEST_PATH_ARRAY[0]}"):/test-data:Z"
    CONTAINER_TEST_PATHS="/test-data"
else
    # Multiple test paths - mount each separately and build container paths
    CONTAINER_TEST_PATHS=""
    for i in "${!TEST_PATH_ARRAY[@]}"; do
        test_path=$(echo "${TEST_PATH_ARRAY[$i]}" | xargs)  # Trim whitespace
        PODMAN_CMD="$PODMAN_CMD -v $(realpath "$test_path"):/test-data-$i:Z"
        if [[ -z "$CONTAINER_TEST_PATHS" ]]; then
            CONTAINER_TEST_PATHS="/test-data-$i"
        else
            CONTAINER_TEST_PATHS="$CONTAINER_TEST_PATHS,/test-data-$i"
        fi
    done
fi

# Add artifacts volume if provided
if [[ -n "$ARTIFACTS_PATH" ]]; then
    PODMAN_CMD="$PODMAN_CMD -v $(realpath "$ARTIFACTS_PATH"):/artifacts:Z"
    ARTIFACTS_ARG="--artifacts-path /artifacts"
else
    ARTIFACTS_ARG=""
fi

# Add image
PODMAN_CMD="$PODMAN_CMD ${IMAGE_NAME}:${IMAGE_TAG}"

# Add kai eval command with arguments
PODMAN_CMD="$PODMAN_CMD eval -c /config/config.json -t $CONTAINER_TEST_PATHS --output-dir /output"

# Add test selectors if provided
if [[ -n "$TEST_SELECTORS" ]]; then
    PODMAN_CMD="$PODMAN_CMD --test-selectors \"$TEST_SELECTORS\""
fi

# Add artifacts path if provided
if [[ -n "$ARTIFACTS_ARG" ]]; then
    PODMAN_CMD="$PODMAN_CMD $ARTIFACTS_ARG"
fi

# Add any extra arguments
if [[ -n "$EXTRA_ARGS" ]]; then
    PODMAN_CMD="$PODMAN_CMD $EXTRA_ARGS"
fi

# Print the command being executed
echo "Executing: $PODMAN_CMD"
echo ""
echo "Output will be written to: $(realpath "$OUTPUT_DIR")"
echo ""

# Run the container
eval $PODMAN_CMD
