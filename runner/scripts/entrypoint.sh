#!/bin/bash

set -euo pipefail
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
mkdir -p /logs
echo "Starting Kai Runner..."
exec node /app/dist/main.cjs "$@"
