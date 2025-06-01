# Claude CLI Integration

This document explains how to use Claude Code CLI (claude.ai/code) as an AI provider in Task Master.

## Overview

The Claude CLI provider allows you to use your local Claude Code installation as an AI provider for Task Master. This is particularly useful when you want to:
- Use Claude without consuming API credits
- Test Task Master features with Claude
- Use your Claude Code subscription directly

## Setup

1. **Install Claude Code**: Download and install Claude Code from https://claude.ai/code

2. **Set the environment variable**:
   ```bash
   export CLAUDE_CLI_COMMAND="claude"
   ```
   
   If your Claude CLI has a different name or path, adjust accordingly:
   ```bash
   export CLAUDE_CLI_COMMAND="/path/to/claude"
   ```

3. **Configure Task Master** to use claude-cli as a provider:
   ```bash
   task-master models --setup
   ```
   
   Then select `claude-cli` as your provider and `claude-local` as the model.

## Configuration

In your `.taskmaster/config.json` or `.taskmasterconfig`:

```json
{
  "models": {
    "main": {
      "provider": "claude-cli",
      "modelId": "claude-local",
      "maxTokens": 64000,
      "temperature": 0.2
    }
  }
}
```

## Limitations

- **No streaming support**: The CLI provider doesn't support streaming responses
- **No object generation**: Structured output generation is not supported
- **No token usage tracking**: The CLI doesn't provide token usage information
- **Print mode only**: Uses Claude's print mode (`-p` flag) for automation

## How It Works

The Claude CLI provider:
1. Formats your messages into a prompt
2. Executes the Claude CLI with the `-p` (print mode) flag
3. Returns the response as text

## Troubleshooting

### Command not found
If you get a "command not found" error, ensure:
- Claude Code is installed
- The `CLAUDE_CLI_COMMAND` environment variable is set correctly
- The command is in your PATH or use an absolute path

### No response
If Claude doesn't respond:
- Check that Claude Code is activated and logged in
- Try running the command manually: `claude -p "Hello"`
- Ensure you have an active Claude subscription

### Large responses
The provider sets a 10MB buffer limit for responses. Very large responses may be truncated.

## Example Usage

```bash
# Set up the environment
export CLAUDE_CLI_COMMAND="claude"

# Configure Task Master to use Claude CLI
task-master models --setup
# Select: claude-cli / claude-local

# Use Task Master normally
task-master parse-prd my-project.txt
task-master expand task-001
```