#!/bin/bash
set -e

AGENTIC_DIR="../../editor-extensions/agentic"
VENDOR_DIR="./vendor"

if [ ! -d "$AGENTIC_DIR" ]; then
    echo "Error: Agentic directory not found at $AGENTIC_DIR"
    exit 1
fi

cd "$AGENTIC_DIR"
npm install
npm run build
npm pack

TARBALL=$(ls editor-extensions-agentic-*.tgz 2>/dev/null | head -n 1)
if [ -z "$TARBALL" ]; then
    echo "Error: No tarball found"
    exit 1
fi

cd - > /dev/null
mv "$AGENTIC_DIR/$TARBALL" "$VENDOR_DIR/"

echo "Agentic dependency built and packaged: $VENDOR_DIR/$TARBALL"

npm install