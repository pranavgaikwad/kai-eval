#!/bin/bash

set -e
VENDOR_DIR="./vendor"
KAI_VERSION="v0.8.0-beta.4"

mkdir -p "$VENDOR_DIR"

echo "Using Kai version ${KAI_VERSION}"

detect_platform() {
    case "$(uname -s)" in
        Linux*)
            case "$(uname -m)" in
                x86_64) echo "linux-x86_64" ;;
                aarch64|arm64) echo "linux-aarch64" ;;
                *) echo "Unsupported Linux architecture: $(uname -m)" && exit 1 ;;
            esac
            ;;
        Darwin*)
            case "$(uname -m)" in
                x86_64) echo "macos-x86_64" ;;
                arm64) echo "macos-arm64" ;;
                *) echo "Unsupported macOS architecture: $(uname -m)" && exit 1 ;;
            esac
            ;;
        CYGWIN*|MINGW32*|MINGW64*|MSYS*)
            echo "windows-X64" ;;
        *)
            echo "Unsupported operating system: $(uname -s)" && exit 1 ;;
    esac
}

source .env || true

echo "Setting up Rulesets..."
RULESETS_DIR="$VENDOR_DIR/rulesets"
if [ -d "$RULESETS_DIR" ]; then
    echo "Removing existing rulesets..."
    rm -rf "$RULESETS_DIR"
fi
echo "Downloading rulesets from GitHub..."
git clone https://github.com/konveyor/rulesets.git "$RULESETS_DIR"
echo "Rulesets cloned to $RULESETS_DIR"

echo "Setting up Kai Analyzer RPC..."
PLATFORM=$(detect_platform)
ANALYZER_BINARY="kai-analyzer-rpc-${PLATFORM}"

if [ "$PLATFORM" = "windows-X64" ]; then
    ANALYZER_BINARY="${ANALYZER_BINARY}.exe"
fi

ANALYZER_DIR="$VENDOR_DIR/analyzer"
mkdir -p "$ANALYZER_DIR"
KAI_ANALYZER_URL="https://github.com/konveyor/kai/releases/download/${KAI_VERSION}/${ANALYZER_BINARY}"
echo "Downloading analyzer for ${PLATFORM}: ${KAI_ANALYZER_URL}"

curl -fsSL -o "$ANALYZER_DIR/kai_analyzer_rpc" "$KAI_ANALYZER_URL"
chmod +x "$ANALYZER_DIR/kai_analyzer_rpc"
echo "Kai Analyzer RPC downloaded to $ANALYZER_DIR/kai_analyzer_rpc"

echo "Setting up JDTLS..."
JDTLS_DIR="$VENDOR_DIR/jdtls"
if [ -d "$JDTLS_DIR" ]; then
    echo "Removing existing JDTLS..."
    rm -rf "$JDTLS_DIR"
fi
mkdir -p "$JDTLS_DIR"
CONTAINER_CMD=""
if command -v podman &> /dev/null; then
    CONTAINER_CMD="podman"
elif command -v docker &> /dev/null; then
    CONTAINER_CMD="docker"
else
    echo "Error: Neither podman nor docker is available. Please install one of them."
    exit 1
fi
echo "Using container runtime: $CONTAINER_CMD"
echo "Pulling JDTLS container image..."
$CONTAINER_CMD pull quay.io/konveyor/jdtls-server-base:latest
echo "Extracting JDTLS from container..."
CONTAINER_ID=$($CONTAINER_CMD create quay.io/konveyor/jdtls-server-base:latest)
$CONTAINER_CMD cp "$CONTAINER_ID:/jdtls" "$VENDOR_DIR/"
$CONTAINER_CMD rm "$CONTAINER_ID"
echo "JDTLS extracted to $JDTLS_DIR"