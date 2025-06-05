#!/bin/bash

# Task Master Installation Script from Source
# This script installs Task Master with Claude CLI support from source

set -e

echo "Task Master Installation from Source"
echo "===================================="

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js 18 or higher is required (found: $(node -v))"
    exit 1
fi

# Check if we're in the task-master directory
if [ ! -f "package.json" ] || [ ! -f "index.js" ]; then
    echo "Error: This script must be run from the claude-task-master directory"
    exit 1
fi

echo "Installing dependencies..."
npm install

echo "Installing Task Master globally..."
npm install -g .

echo ""
echo "✅ Task Master installed successfully!"
echo ""
echo "Version: $(task-master --version 2>/dev/null || echo 'Version check failed')"
echo ""
echo "Next steps:"
echo "1. Run 'task-master init' in your project directory"
echo "2. Configure Claude CLI in .taskmaster/.env:"
echo "   CLAUDE_CLI_ENABLED_MAIN=true"
echo "   CLAUDE_CLI_COMMAND=/path/to/claude --model opus -p"
echo "   DEFAULT_AI_PROVIDER=claude-cli"
echo ""
echo "For more information: task-master --help"