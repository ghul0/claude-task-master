/**
 * .clauderc parser - CLI-style configuration file parser
 * 
 * Parses .clauderc files with bash-like syntax for developer-friendly configuration.
 * Supports aliases, shortcuts, and environment variable expansion.
 * 
 * Example .clauderc:
 * ```
 * # Claude Code configuration
 * command=/usr/local/bin/claude
 * model=claude-3-5-sonnet-20241022
 * 
 * # Aliases for quick model switching
 * alias opus="--model claude-3-opus-20240229"
 * alias sonnet="--model claude-3-5-sonnet-20241022"
 * alias haiku="--model claude-3-haiku-20240307"
 * 
 * # Common argument shortcuts
 * alias fast="--model haiku"
 * alias creative="--model opus"
 * alias debug="--verbose"
 * 
 * # Environment variables
 * export CLAUDE_CODE_TIMEOUT=300000
 * export CLAUDE_CODE_USE_FILE_REFERENCE=true
 * ```
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Parse a .clauderc file with bash-like syntax
 * 
 * @param {string} content - File content to parse
 * @returns {object} Parsed configuration object
 */
export function parseClaudeRC(content) {
  const config = {
    variables: {},
    aliases: {},
    exports: {},
    raw: []
  };

  const lines = content.split('\n');
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum].trim();
    
    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }
    
    // Handle line continuations with backslash
    let fullLine = line;
    while (fullLine.endsWith('\\') && lineNum < lines.length - 1) {
      fullLine = fullLine.slice(0, -1).trim() + ' ' + lines[++lineNum].trim();
    }
    
    // Parse different types of lines
    if (fullLine.startsWith('alias ')) {
      parseAlias(fullLine, config.aliases);
    } else if (fullLine.startsWith('export ')) {
      parseExport(fullLine, config.exports);
    } else if (fullLine.includes('=') && !fullLine.includes(' ')) {
      parseVariable(fullLine, config.variables);
    } else {
      // Store unrecognized lines for potential custom processing
      config.raw.push(fullLine);
    }
  }
  
  return config;
}

/**
 * Parse an alias definition
 * 
 * @param {string} line - Alias line to parse
 * @param {object} aliases - Aliases object to populate
 */
function parseAlias(line, aliases) {
  // Remove 'alias ' prefix
  const aliasContent = line.substring(6).trim();
  
  // Find the equals sign, handling quoted values
  const equalsIndex = findUnquotedChar(aliasContent, '=');
  if (equalsIndex === -1) return;
  
  const name = aliasContent.substring(0, equalsIndex).trim();
  const value = unquote(aliasContent.substring(equalsIndex + 1).trim());
  
  if (name && value) {
    aliases[name] = value;
  }
}

/**
 * Parse an export statement
 * 
 * @param {string} line - Export line to parse
 * @param {object} exports - Exports object to populate
 */
function parseExport(line, exports) {
  // Remove 'export ' prefix
  const exportContent = line.substring(7).trim();
  
  // Find the equals sign
  const equalsIndex = exportContent.indexOf('=');
  if (equalsIndex === -1) return;
  
  const name = exportContent.substring(0, equalsIndex).trim();
  const value = unquote(exportContent.substring(equalsIndex + 1).trim());
  
  if (name && value !== undefined) {
    exports[name] = expandVariables(value);
  }
}

/**
 * Parse a variable assignment
 * 
 * @param {string} line - Variable line to parse
 * @param {object} variables - Variables object to populate
 */
function parseVariable(line, variables) {
  const equalsIndex = line.indexOf('=');
  if (equalsIndex === -1) return;
  
  const name = line.substring(0, equalsIndex).trim();
  const value = unquote(line.substring(equalsIndex + 1).trim());
  
  if (name && value !== undefined) {
    variables[name] = expandVariables(value);
  }
}

/**
 * Find the first occurrence of a character outside of quotes
 * 
 * @param {string} str - String to search
 * @param {string} char - Character to find
 * @returns {number} Index of character or -1 if not found
 */
function findUnquotedChar(str, char) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  
  for (let i = 0; i < str.length; i++) {
    if (escaped) {
      escaped = false;
      continue;
    }
    
    const c = str[i];
    
    if (c === '\\') {
      escaped = true;
      continue;
    }
    
    if (c === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (c === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (c === char && !inSingleQuote && !inDoubleQuote) {
      return i;
    }
  }
  
  return -1;
}

/**
 * Remove surrounding quotes from a string
 * 
 * @param {string} str - String to unquote
 * @returns {string} Unquoted string
 */
function unquote(str) {
  if (!str) return str;
  
  // Remove surrounding quotes if they match
  if ((str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1);
  }
  
  return str;
}

/**
 * Expand environment variables in a string
 * 
 * @param {string} str - String with potential variables
 * @returns {string} String with variables expanded
 */
function expandVariables(str) {
  if (!str || typeof str !== 'string') return str;
  
  // Expand $VAR and ${VAR} style variables
  return str.replace(/\$\{([^}]+)\}|\$(\w+)/g, (match, braceVar, simpleVar) => {
    const varName = braceVar || simpleVar;
    return process.env[varName] || match;
  });
}

/**
 * Load .clauderc configuration from standard locations
 * 
 * @param {object} options - Loading options
 * @param {string} [options.cwd] - Current working directory
 * @param {string} [options.path] - Explicit path to .clauderc file
 * @returns {object|null} Parsed configuration or null if not found
 */
export function loadClaudeRC(options = {}) {
  const paths = [];
  
  // Add explicit path if provided
  if (options.path) {
    paths.push(options.path);
  }
  
  // Add standard search paths
  const cwd = options.cwd || process.cwd();
  paths.push(
    join(cwd, '.clauderc'),
    join(homedir(), '.clauderc'),
    join(homedir(), '.config', 'claude', 'clauderc')
  );
  
  // Find and parse the first existing file
  for (const path of paths) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, 'utf8');
        const config = parseClaudeRC(content);
        config._path = path; // Store the path for reference
        return config;
      } catch (error) {
        console.warn(`Error parsing .clauderc at ${path}:`, error.message);
      }
    }
  }
  
  return null;
}

/**
 * Apply aliases to a command string
 * 
 * @param {string} command - Command string
 * @param {object} aliases - Aliases object
 * @returns {string} Command with aliases expanded
 */
export function applyAliases(command, aliases) {
  if (!aliases || Object.keys(aliases).length === 0) {
    return command;
  }
  
  // Split command into parts, respecting quotes
  const parts = [];
  let current = '';
  let inQuote = false;
  let quoteChar = null;
  
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    
    if ((char === '"' || char === "'") && (!inQuote || char === quoteChar)) {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else {
        inQuote = false;
        quoteChar = null;
      }
      current += char;
    } else if (char === ' ' && !inQuote) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  
  if (current) {
    parts.push(current);
  }
  
  // Expand aliases in parts
  const expandedParts = parts.map(part => {
    // Remove quotes for alias lookup
    const unquotedPart = unquote(part);
    if (aliases[unquotedPart]) {
      return aliases[unquotedPart];
    }
    return part;
  });
  
  return expandedParts.join(' ');
}

/**
 * Get effective configuration merging RC file with environment
 * 
 * @param {object} rcConfig - Parsed RC configuration
 * @returns {object} Effective configuration
 */
export function getEffectiveConfig(rcConfig) {
  const config = {
    command: null,
    model: null,
    aliases: {},
    environment: {}
  };
  
  if (rcConfig) {
    // Apply RC file settings
    if (rcConfig.variables.command) {
      config.command = rcConfig.variables.command;
    }
    if (rcConfig.variables.model) {
      config.model = rcConfig.variables.model;
    }
    
    // Copy aliases
    config.aliases = { ...rcConfig.aliases };
    
    // Apply exports to environment
    if (rcConfig.exports) {
      Object.assign(config.environment, rcConfig.exports);
    }
  }
  
  // Environment variables take precedence
  if (process.env.CLAUDE_CODE_COMMAND) {
    config.command = process.env.CLAUDE_CODE_COMMAND;
  }
  if (process.env.CLAUDE_CODE_MODEL) {
    config.model = process.env.CLAUDE_CODE_MODEL;
  }
  
  return config;
}

/**
 * Create default .clauderc content
 * 
 * @returns {string} Default configuration content
 */
export function createDefaultClaudeRC() {
  return `# Claude Code configuration
# This file uses bash-like syntax for developer-friendly configuration

# Command path (auto-detected if not specified)
# command=/usr/local/bin/claude

# Default model (use simplified names: opus, sonnet, or haiku)
model=sonnet

# Model aliases for quick switching
alias opus="--model opus"
alias sonnet="--model sonnet"
alias haiku="--model haiku"

# Shortcuts for common configurations
alias fast="--model haiku"
alias creative="--model opus"
alias balanced="--model sonnet"

# Development shortcuts (if supported by Claude Code)
alias debug="--verbose"
alias quiet="-p"  # Print mode only

# Task-specific presets
alias code="--model sonnet"
alias docs="--model opus"
alias quick="--model haiku"

# MCP configurations (if using Model Context Protocol)
alias mcp="--mcp-config ~/.claude/mcp.json"
alias mcp-read="--mcp-config ~/.claude/mcp.json --allowedTools 'Read,Grep,Glob'"

# Environment variables
export CLAUDE_CODE_TIMEOUT=300000
export CLAUDE_CODE_USE_FILE_REFERENCE=false

# Example custom aliases (uncomment to use)
# alias myproject="--model opus --mcp-config ~/projects/my-project/mcp.json"
# alias test="--model haiku"
`;
}