#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

echo "🧪 Running test suite with environment configuration..."
echo "Project root: $PROJECT_ROOT"
echo "Environment file: $ENV_FILE"

if [ -f "$ENV_FILE" ]; then
    echo "✅ Found .env file, loading environment variables..."
    set -a
    source "$ENV_FILE"
    set +a
else
    echo "⚠️  No .env file found at $ENV_FILE"
    echo "Copy the .env.example file to $ENV_FILE and fill in the required variables."
    exit 1
fi
cd "$PROJECT_ROOT"
echo ""
echo "🚀 Starting test execution..."
echo "----------------------------------------"
exec jest "$@"