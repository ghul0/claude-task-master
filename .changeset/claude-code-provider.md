---
"task-master-ai": minor
---

Add Claude Code provider for local AI assistance

- Add new `claude-code` provider that uses Claude Code application via CLI
- Enable zero-cost AI assistance for users with Claude Code PRO or MAX subscription
- Configure via `CLAUDE_CODE_COMMAND` environment variable
- Add support for custom Claude flags and configurations
- Include comprehensive documentation in CLAUDE_CODE_USAGE.md

## Setup example

```bash
# .env
CLAUDE_CODE_COMMAND=/home/user/.claude/local/claude

# or in mcp.json
{
  "mcpServers": {
    "taskmaster": {
      "env": {
        "CLAUDE_CODE_COMMAND": "/home/user/.claude/local/claude"
      }
    }
  }
}
```