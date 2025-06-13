# Claude Code Integration

This document explains how to use Claude Code (claude.ai/code) as an AI provider in Task Master.

## Overview

The Claude Code provider allows you to use your local Claude Code installation as an AI provider for Task Master. This is particularly useful when you want to:
- Use Claude without consuming API credits
- Test Task Master features with Claude
- Use your Claude Code subscription directly

## Setup

### Installation

1. **Install Claude Code** via npm:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. **Configure Task Master** to use claude-code as a provider:
   ```bash
   task-master models --setup
   ```
   
   Then select `claude-code` as your provider and `claude-local` as the model.

### Auto-Detection Behavior

The Claude Code provider will automatically detect Claude Code if it's installed in standard locations:

**macOS:**
- `/usr/local/bin/claude` (Homebrew Node.js global)
- `~/.npm-global/bin/claude` (User-specific npm)
- In your system PATH

**Linux:**
- `/usr/bin/claude` (System-wide npm)
- `~/.npm-global/bin/claude` (User-specific npm)
- In your system PATH

If Claude is installed in a standard location, no additional configuration is needed!

### Manual Configuration (Optional)

For non-standard installations or to specify custom flags, set the `CLAUDE_CODE_COMMAND` environment variable.

**Important**: Even if `claude` is in your PATH, some system configurations may require the full path. If you encounter issues with just `claude`, try using the full path instead:

```bash
# Try simple command first
export CLAUDE_CODE_COMMAND="claude"

# If that doesn't work, use full path (example paths):
export CLAUDE_CODE_COMMAND="/home/user/.npm-global/bin/claude"
export CLAUDE_CODE_COMMAND="/usr/local/bin/claude"

# With custom model selection
export CLAUDE_CODE_COMMAND="claude --model opus"

# With MCP configuration
export CLAUDE_CODE_COMMAND="claude --mcp-config /path/to/config.json"
```

To find your Claude installation path:
```bash
which claude  # Shows the full path to claude
```

### Priority Order

The provider uses the following priority for determining the Claude command:
1. Parameter override (when calling the API)
2. `CLAUDE_CODE_COMMAND` environment variable
3. Auto-detection in standard locations

## Configuration

In your `.taskmaster/config.json`:

```json
{
  "models": {
    "main": {
      "provider": "claude-code",
      "modelId": "claude-local",
      "maxTokens": 200000,
      "temperature": 0.2
    }
  }
}
```

## Model Configuration

You can configure which Claude model to use through environment variables:

```bash
# Use model names that Claude Code understands
export CLAUDE_CODE_MODEL=opus      # Claude will use the latest Opus model
export CLAUDE_CODE_MODEL=sonnet    # Claude will use the latest Sonnet model

# Or use full model names
export CLAUDE_CODE_MODEL=claude-3-5-sonnet-20241022
```

Model configuration priority:
1. `params.modelId` (when using programmatically)
2. `CLAUDE_CODE_MODEL` environment variable
3. Existing `--model` flag in `CLAUDE_CODE_COMMAND`

Note: Model names like 'opus' and 'sonnet' are passed directly to Claude Code, which handles resolving them to the appropriate model version.

## Features and Limitations

### Features
- **Zero-cost usage**: Uses your existing Claude Pro/Max subscription
- **Object generation support**: Through automatic conversion to JSON prompts
- **Large input handling**: Uses temporary files for prompts exceeding shell limits
- **File reference mode**: Can reference files instead of including full content
- **Configurable timeout**: Default 5 minutes, adjustable per request
- **Automatic flag handling**: Adds `-p` flag if not present
- **Model selection**: Configure which Claude model to use via environment variables

### Limitations
- **No streaming support**: The Claude Code provider doesn't support streaming responses
- **No token usage tracking**: Claude Code doesn't provide token usage information
- **Print mode only**: Uses Claude's print mode (`-p` flag) for automation

## How It Works

The Claude Code provider:
1. Formats your messages into a prompt
2. Writes the prompt to a temporary file (to handle large inputs)
3. Executes the Claude Code with input redirection: `claude -p < /tmp/prompt.txt`
4. Parses the response (handling JSON for object generation requests)
5. Cleans up the temporary file
6. Returns the response

## Troubleshooting

### Claude Not Found

If you see "Claude Code not found", try these steps:

1. **Verify Installation**:
   ```bash
   which claude  # Should show the path to claude
   claude --version  # Should display version info
   ```

2. **Install Claude Code**:
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

3. **Set Manual Path** (if needed):
   ```bash
   export CLAUDE_CODE_COMMAND="/path/to/claude"
   ```

### Auto-Detection Not Working

If auto-detection fails but Claude is installed:

1. Check if Claude is in PATH:
   ```bash
   echo $PATH | tr ':' '\n' | grep -E '(npm|node)'
   ```

2. Find Claude installation:
   ```bash
   find ~ -name "claude" -type f 2>/dev/null | grep -E "(bin|node_modules)"
   ```

3. Use manual configuration with the found path

## Example Usage

### Basic Claude Code Usage
```bash
# No setup required if Claude is in standard location!
task-master parse-prd my-project.txt
task-master expand task-001
```

### With Manual Configuration
```bash
# Set custom command
export CLAUDE_CODE_COMMAND="/home/user/.npm-global/bin/claude"

# Use Task Master normally
task-master models --setup
task-master parse-prd
```

### MCP Server Usage
```json
// In Claude Desktop's MCP settings:
{
  "mcpServers": {
    "task-master": {
      "command": "node",
      "args": ["/path/to/task-master/mcp-server/server.js"],
      "cwd": "/path/to/your/project",
      "env": {
        // Optional - only if Claude is not in standard location
        "CLAUDE_CODE_COMMAND": "/custom/path/to/claude",
        // Optional - configure model
        "CLAUDE_CODE_MODEL": "opus"
      }
    }
  }
}
```

## Notes

- Claude Code requires Node.js 18 or higher
- Requires either:
  - Claude Pro or Claude Max subscription (no additional costs beyond subscription)
  - Anthropic API account (will incur standard API usage costs)
- The provider caches auto-detection results for performance
- Cached results persist for the lifetime of the provider instance