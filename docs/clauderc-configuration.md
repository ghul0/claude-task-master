# Claude Code RC Configuration

The Claude Code provider supports a developer-friendly `.clauderc` configuration file with bash-like syntax for easy customization of your Claude Code CLI experience.

## Quick Start

Create a `.clauderc` file in your project or home directory:

```bash
# Create in current directory
node scripts/modules/claude-rc-init.js

# Create global config in home directory
node scripts/modules/claude-rc-init.js --global
```

## Configuration Priority

Settings are resolved in the following order (highest to lowest priority):

1. **Function parameters** - Direct arguments to API calls
2. **Environment variables** - `CLAUDE_CODE_COMMAND`, `CLAUDE_CODE_MODEL`
3. **.clauderc file** - Local or global configuration
4. **Built-in defaults** - Sensible fallbacks
5. **Auto-detection** - Searching common installation paths

## File Locations

The `.clauderc` file is searched in these locations (first found wins):

1. `./.clauderc` - Current directory
2. `~/.clauderc` - Home directory
3. `~/.config/claude/clauderc` - XDG config directory

## Syntax

The `.clauderc` file uses bash-like syntax:

```bash
# Comments start with hash
variable=value
alias name="expansion"
export ENV_VAR=value
```

## Features

### Basic Configuration

```bash
# Path to Claude executable (auto-detected if not set)
command=/usr/local/bin/claude

# Default model (use simplified name: opus, sonnet, or haiku)
model=sonnet
```

### Model Aliases

Quick shortcuts for model selection:

```bash
# Short names (Claude Code uses simplified model names)
alias opus="--model opus"
alias sonnet="--model sonnet"
alias haiku="--model haiku"
```

Usage:
```bash
taskmaster parse-prd --provider claude-code --model opus
```

### Performance Presets

Pre-configured settings for different use cases:

```bash
# Model selection for different needs
alias fast="--model haiku"
alias creative="--model opus"
alias balanced="--model sonnet"

# Task-specific
alias code="--model sonnet"
alias docs="--model opus"
alias quick="--model haiku"
```

### Environment Variables

Set environment variables that will be available when Claude Code runs:

```bash
# Timeout in milliseconds
export CLAUDE_CODE_TIMEOUT=300000

# Enable file reference mode for large inputs
export CLAUDE_CODE_USE_FILE_REFERENCE=true

# Custom variables
export MY_PROJECT_PATH=/path/to/project
```

### Advanced Features

```bash
# Line continuation with backslash
alias complex="--model opus \
               --mcp-config ~/.claude/mcp.json \
               --allowedTools 'Read,Write,Edit'"

# Variable expansion
export PROJECT_ROOT=$HOME/projects
command=$PROJECT_ROOT/claude/bin/claude

# Quotes (both single and double supported)
alias with-spaces="--mcp-config '/path with spaces/mcp.json'"
alias with-vars="--mcp-config $HOME/.claude/mcp.json"
```

## Examples

### Simple Configuration

```bash
# .clauderc
model=sonnet
alias fast="--model haiku"
alias careful="--model sonnet"
```

### Development Setup

```bash
# .clauderc
# Use Opus for complex tasks by default
model=opus

# Quick model switching
alias opus="--model opus"
alias sonnet="--model sonnet"
alias haiku="--model haiku"

# Development presets
alias dev="--model sonnet"
alias test="--model haiku"
alias prod="--model opus"

# Debugging (if supported by Claude Code)
alias debug="--verbose"
export CLAUDE_CODE_TIMEOUT=600000  # 10 minutes for complex tasks
```

### Project-Specific Configuration

Create a `.clauderc` in your project root:

```bash
# project/.clauderc
# Project-specific model
model=sonnet

# Project shortcuts
alias lint="--model sonnet"
alias refactor="--model opus"
alias explain="--model sonnet"

# Project paths
export PROJECT_DOCS=$PWD/docs
export PROJECT_TESTS=$PWD/tests
```

## Usage with Task Master

The aliases work seamlessly with Task Master commands:

```bash
# Use model alias
taskmaster add-task "Implement feature" --provider claude-code --model opus

# Use preset alias
taskmaster parse-prd --provider claude-code --model fast

# Combine multiple aliases (if supported by Claude CLI)
taskmaster update-task 5 --provider claude-code --model "code debug"
```

## Tips

1. **Project-specific configs**: Place `.clauderc` in project roots for project-specific settings
2. **Global defaults**: Use `~/.clauderc` for your personal defaults
3. **Environment variables**: Use `$HOME`, `$USER`, etc. in values
4. **Debugging**: Use `alias debug="--verbose"` for troubleshooting
5. **Performance**: Haiku model for fast, simple tasks

## Troubleshooting

### Config not loading

Check file locations and permissions:
```bash
ls -la .clauderc ~/.clauderc ~/.config/claude/clauderc
```

### Aliases not working

Ensure proper syntax:
- No spaces around `=`
- Quotes around values with spaces
- Valid alias names (alphanumeric + underscore)

### Environment variables not set

Variables are only set when Claude Code executes, not in your shell. Use for Claude Code behavior, not shell commands.

## See Also

- [Claude Code Provider Documentation](./ai-providers.md#claude-code)
- [Task Master Configuration](./configuration.md)
- [Example .clauderc](../example.clauderc)