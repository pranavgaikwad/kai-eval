#!/bin/bash
set -e

VENDOR_DIR="./vendor"

mkdir -p "$VENDOR_DIR"

echo "Setting up dependencies in $VENDOR_DIR..."

source .env || true

echo "Setting up Editor Extensions (Shared and Agentic)..."
if [ -n "$PATH_EDITOR_EXTENSIONS" ] && [ -d "$PATH_EDITOR_EXTENSIONS" ]; then
    echo "Using local editor-extensions from: $PATH_EDITOR_EXTENSIONS"
    EDITOR_EXT_DIR="$PATH_EDITOR_EXTENSIONS"

    if [ ! -d "$EDITOR_EXT_DIR/shared" ]; then
        echo "Error: Shared directory not found at $EDITOR_EXT_DIR/shared"
        exit 1
    fi

    if [ ! -d "$EDITOR_EXT_DIR/agentic" ]; then
        echo "Error: Agentic directory not found at $EDITOR_EXT_DIR/agentic"
        exit 1
    fi

    echo "Building packages using npm workspaces..."
    pushd "$EDITOR_EXT_DIR"

    # Install dependencies and build using npm workspaces
    npm install

    # Verify builds completed successfully
    if [ ! -d "shared/dist" ]; then
        echo "Shared build failed, trying manual build..."
        npm run build -w shared
    fi

    if [ ! -d "agentic/dist" ]; then
        echo "Agentic build failed, trying manual build..."
        npm run build -w agentic
    fi

    # Pack shared package
    echo "Packaging shared module..."
    cd shared
    # Temporarily add files field to package.json to include dist directory
    if [ -f "package.json" ]; then
        cp package.json package.json.backup
        # Add files field to include dist directory
        node -e "
        const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
        pkg.files = ['dist', 'src', 'package.json'];
        require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));
        "
    fi
    npm pack
    # Restore original package.json
    if [ -f "package.json.backup" ]; then
        mv package.json.backup package.json
    fi
    SHARED_TARBALL=$(ls editor-extensions-shared-*.tgz 2>/dev/null | head -n 1)
    if [ -z "$SHARED_TARBALL" ]; then
        echo "Error: No shared tarball found"
        exit 1
    fi
    # Pack agentic package
    echo "Packaging agentic module..."
    cd ../agentic
    if [ -f "package.json" ]; then
        cp package.json package.json.backup
        # Add files field to include dist directory
        node -e "
        const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
        pkg.files = ['dist', 'src', 'package.json'];
        require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));
        "
    fi
    npm pack
    AGENTIC_TARBALL=$(ls editor-extensions-agentic-*.tgz 2>/dev/null | head -n 1)
    if [ -z "$AGENTIC_TARBALL" ]; then
        echo "Error: No agentic tarball found"
        exit 1
    fi

    popd
    mv "$EDITOR_EXT_DIR/shared/$SHARED_TARBALL" "$VENDOR_DIR/"
    mv "$EDITOR_EXT_DIR/agentic/$AGENTIC_TARBALL" "$VENDOR_DIR/"
    echo "Shared dependency built and packaged: $VENDOR_DIR/$SHARED_TARBALL"
    echo "Agentic dependency built and packaged: $VENDOR_DIR/$AGENTIC_TARBALL"

else
    echo "Downloading editor-extensions from GitHub..."
    EDITOR_EXT_DIR="$VENDOR_DIR/editor-extensions"

    if [ -d "$EDITOR_EXT_DIR" ]; then
        echo "Removing existing editor-extensions..."
        rm -rf "$EDITOR_EXT_DIR"
    fi

    git clone https://github.com/konveyor/editor-extensions.git "$EDITOR_EXT_DIR"
    echo "Editor-extensions cloned to $EDITOR_EXT_DIR"

    echo "Building packages using npm workspaces..."
    pushd "$EDITOR_EXT_DIR"

    # Install dependencies and build using npm workspaces
    npm install

    # Verify builds completed successfully
    if [ ! -d "shared/dist" ]; then
        echo "Shared build failed, trying manual build..."
        npm run build -w shared
    fi

    if [ ! -d "agentic/dist" ]; then
        echo "Agentic build failed, trying manual build..."
        npm run build -w agentic
    fi


    # Pack shared package
    echo "Packaging shared module..."
    cd shared
    # Temporarily add files field to package.json to include dist directory
    if [ -f "package.json" ]; then
        cp package.json package.json.backup
        # Add files field to include dist directory
        node -e "
        const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
        pkg.files = ['dist', 'src', 'package.json'];
        require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));
        "
    fi
    npm pack
    SHARED_TARBALL=$(ls editor-extensions-shared-*.tgz 2>/dev/null | head -n 1)
    if [ -z "$SHARED_TARBALL" ]; then
        echo "❌ Error: No tarball found for shared/ module"
        exit 1
    fi

    # Pack agentic package
    echo "Packaging agentic module..."
    cd ../agentic
    # Temporarily add files field to package.json to include dist directory
    if [ -f "package.json" ]; then
        cp package.json package.json.backup
        # Add files field to include dist directory
        node -e "
        const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8'));
        pkg.files = ['dist', 'src', 'package.json'];
        require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));
        "
    fi
    npm pack
    AGENTIC_TARBALL=$(ls editor-extensions-agentic-*.tgz 2>/dev/null | head -n 1)
    if [ -z "$AGENTIC_TARBALL" ]; then
        echo "❌ Error: No tarball found for agentic/ module"
        exit 1
    fi

    popd
    mv "$EDITOR_EXT_DIR/shared/$SHARED_TARBALL" "$VENDOR_DIR/"
    mv "$EDITOR_EXT_DIR/agentic/$AGENTIC_TARBALL" "$VENDOR_DIR/"
    rm -rf "$EDITOR_EXT_DIR"
    echo "Shared dependency built and packaged: $VENDOR_DIR/$SHARED_TARBALL"
    echo "Agentic dependency built and packaged: $VENDOR_DIR/$AGENTIC_TARBALL"
fi


