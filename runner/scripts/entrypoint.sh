#!/bin/bash

set -euo pipefail

# Default configuration file
CONFIG_FILE="/app/.config.json"

# Parse command-line arguments to extract targets and sources
TARGETS=""
SOURCES=""
EXTRA_ARGS=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --targets)
            TARGETS="$2"
            shift 2
            ;;
        --sources)
            SOURCES="$2"
            shift 2
            ;;
        --help|-h)
            echo "Kai Runner Container"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --targets <targets>     Comma-separated list of migration targets"
            echo "  --sources <sources>     Comma-separated list of migration sources"
            echo "  --help, -h              Show this help message"
            echo ""
            echo "Environment Variables:"
            echo "  OPENAI_API_KEY          OpenAI API key (required for ChatOpenAI model)"
            echo "  AZURE_OPENAI_API_KEY    Azure OpenAI API key"
            echo "  DEEPSEEK_API_KEY        DeepSeek API key"
            echo "  GOOGLE_API_KEY          Google API key"
            echo "  AWS_ACCESS_KEY_ID       AWS access key"
            echo "  AWS_SECRET_ACCESS_KEY   AWS secret key"
            echo "  AWS_DEFAULT_REGION      AWS default region"
            echo ""
            echo "Volumes:"
            echo "  /workspace              Mount your Java project here"
            echo "  /logs                   Log files will be written here"
            echo "  /analyzer               Mount kai-analyzer binary here (optional)"
            echo ""
            echo "Example:"
            echo "  docker run -v /path/to/project:/workspace -v /path/to/logs:/logs \\"
            echo "    -e OPENAI_API_KEY=your_key kai-runner --targets quarkus3 --sources eap7"
            exit 0
            ;;
        *)
            EXTRA_ARGS="$EXTRA_ARGS $1"
            shift
            ;;
    esac
done

# Create a temporary config file with runtime targets and sources
TEMP_CONFIG="/tmp/runtime.config.json"
cp "$CONFIG_FILE" "$TEMP_CONFIG"

# Update config with runtime targets and sources if provided
if [[ -n "$TARGETS" ]] || [[ -n "$SOURCES" ]]; then
    python3 -c "
import json
import sys

config_file = '$TEMP_CONFIG'
targets = '$TARGETS'.split(',') if '$TARGETS' else []
sources = '$SOURCES'.split(',') if '$SOURCES' else []

try:
    with open(config_file, 'r') as f:
        config = json.load(f)

    if targets:
        config['targets'] = [t.strip() for t in targets if t.strip()]
    if sources:
        config['sources'] = [s.strip() for s in sources if s.strip()]

    with open(config_file, 'w') as f:
        json.dump(config, f, indent=2)
except Exception as e:
    print(f'Error updating config: {e}', file=sys.stderr)
    sys.exit(1)
"
fi

# Validate required environment variables
API_KEY_FOUND=false
if [[ -n "${OPENAI_API_KEY:-}" ]] || [[ -n "${AZURE_OPENAI_API_KEY:-}" ]] || [[ -n "${DEEPSEEK_API_KEY:-}" ]] || [[ -n "${GOOGLE_API_KEY:-}" ]]; then
    API_KEY_FOUND=true
fi

# Check for AWS credentials (all 3 required together)
if [[ -n "${AWS_ACCESS_KEY_ID:-}" ]] && [[ -n "${AWS_SECRET_ACCESS_KEY:-}" ]] && [[ -n "${AWS_DEFAULT_REGION:-}" ]]; then
    API_KEY_FOUND=true
fi

if [[ "$API_KEY_FOUND" == "false" ]]; then
    echo "Warning: No valid API credentials found. Please set one of:"
    echo "  - OPENAI_API_KEY"
    echo "  - AZURE_OPENAI_API_KEY"
    echo "  - DEEPSEEK_API_KEY"
    echo "  - GOOGLE_API_KEY"
    echo "  - AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY + AWS_DEFAULT_REGION (all 3 required)"
fi

# Check if workspace is mounted
if [[ ! -d "/workspace" ]] || [[ -z "$(ls -A /workspace 2>/dev/null)" ]]; then
    echo "Warning: /workspace is empty or not mounted. Please mount your Java project to /workspace"
fi

# Create logs directory if it doesn't exist
mkdir -p /logs

# Run the Kai runner
echo "Starting Kai Runner..."
echo "Configuration: $TEMP_CONFIG"
echo "Workspace: /workspace"
echo "Logs: /logs"

exec node /app/dist/main.js -c "$TEMP_CONFIG" $EXTRA_ARGS