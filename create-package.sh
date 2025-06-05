#!/bin/bash

# Script to create a distributable package of Task Master with Claude CLI support

set -e

echo "Creating Task Master package..."

# Get version from package.json
VERSION=$(node -e "console.log(require('./package.json').version)")
PACKAGE_NAME="task-master-ai-${VERSION}-claude-cli"

# Create package using npm pack
echo "Building package..."
npm pack

# Rename to indicate it includes Claude CLI support
mv task-master-ai-*.tgz "${PACKAGE_NAME}.tgz" 2>/dev/null || true

echo ""
echo "✅ Package created: ${PACKAGE_NAME}.tgz"
echo ""
echo "To install on another system:"
echo "1. Copy ${PACKAGE_NAME}.tgz to the target system"
echo "2. Run: npm install -g ${PACKAGE_NAME}.tgz"
echo ""
echo "Or install directly from GitHub:"
echo "npm install -g git+https://github.com/eyaltoledano/claude-task-master.git"