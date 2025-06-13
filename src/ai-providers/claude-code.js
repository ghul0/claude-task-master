/**
 * src/ai-providers/claude-code.js
 *
 * Implementation for interacting with Claude Code
 * This provider enables using Claude Code application via CLI
 * instead of the Anthropic API. It provides zero-cost local AI
 * assistance when Claude Code is installed.
 *
 * Configuration methods (in priority order):
 * 
 * 1. Function parameters (highest priority)
 *    - Pass modelId: 'opus' or claudeCodeCommand: '/path/to/claude'
 * 
 * 2. Environment variables
 *    - CLAUDE_CODE_COMMAND: Path to claude executable
 *    - CLAUDE_CODE_MODEL: Default model to use
 * 
 * 3. .clauderc configuration file (CLI-style, developer-friendly)
 *    - Supports bash-like syntax with aliases and shortcuts
 *    - Location: ./.clauderc, ~/.clauderc, or ~/.config/claude/clauderc
 *    - Example:
 *      ```
 *      model=claude-3-5-sonnet-20241022
 *      alias opus="--model opus"
 *      alias fast="--model haiku"
 *      export CLAUDE_CODE_TIMEOUT=300000
 *      ```
 *    - Create with: node scripts/modules/claude-rc-init.js
 * 
 * 4. Auto-detection (lowest priority)
 *    - Searches PATH and common installation locations
 *
 * Model aliases: Common shortcuts are supported
 * - 'opus' → Claude will use the Opus model
 * - 'sonnet' → Claude will use the Sonnet model  
 * - 'haiku' → Claude will use the Haiku model
 * - Or define custom aliases in .clauderc
 */

import { BaseAIProvider } from './base-provider.js';
import { spawn, execSync } from 'child_process';
import {
	writeFileSync,
	unlinkSync,
	accessSync,
	constants,
	existsSync,
	createReadStream
} from 'fs';
import { tmpdir, platform, homedir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
	loadClaudeRC,
	getEffectiveConfig,
	applyAliases
} from '../utils/clauderc-parser.js';

/**
 * Claude Code AI Provider
 *
 * Provides integration with Claude Code application through command line interface.
 * This allows users to leverage their local Claude installation without API costs.
 *
 * Features:
 * - Auto-detection of Claude Code installation (no configuration required)
 * - Support for model configuration via modelId parameter or CLAUDE_CODE_MODEL env
 * - Command caching for improved performance
 *
 * @class ClaudeCodeAIProvider
 * @extends {BaseAIProvider}
 *
 * @example
 * // Auto-detection (no configuration needed if claude is in PATH)
 * const provider = new ClaudeCodeAIProvider();
 * const result = await provider.generateText({
 *   messages: [{ role: 'user', content: 'Hello Claude!' }]
 * });
 *
 * @example
 * // With model configuration
 * const result = await provider.generateText({
 *   messages: [{ role: 'user', content: 'Hello Claude!' }],
 *   modelId: 'opus'  // Uses latest opus model
 * });
 *
 * @example
 * // Set environment variable (optional)
 * process.env.CLAUDE_CODE_COMMAND = 'claude --model opus';
 * process.env.CLAUDE_CODE_MODEL = 'sonnet';  // Default model if not in params
 */
export class ClaudeCodeAIProvider extends BaseAIProvider {
	/**
	 * Creates a new Claude Code provider instance
	 *
	 * @constructor
	 * @description Initializes the provider with:
	 * - Name: 'Claude Code'
	 * - Streaming support: false (not supported by CLI)
	 * - Object generation: true (via JSON prompting)
	 * - Command detection cache: undefined (lazy detection)
	 */
	constructor() {
		super();
		this.name = 'Claude Code';
		this.supportsStreaming = false; // Claude Code doesn't support streaming
		this.supportsObjectGeneration = true; // We can support this through JSON prompting
		this._detectedCommand = undefined; // Use undefined for "not attempted yet"
		this._rcConfig = null; // Cache for RC configuration
		this._rcConfigLoaded = false; // Flag to track if we've attempted to load
	}

	/**
	 * Returns the provider name
	 * @returns {string} The provider name
	 */
	getName() {
		return 'Claude Code';
	}

	/**
	 * Resolves model aliases to full model names
	 * @param {string} modelName - The model name or alias
	 * @returns {string|null} The resolved model name or null if empty
	 */
	resolveModelAlias(modelName) {
		if (!modelName) return null;
		
		// Common aliases for Claude models
		const aliases = {
			'opus': 'claude-opus-4-20250514',
			'sonnet': 'claude-sonnet-4-20250514',
			'haiku': 'claude-3-haiku-20240307'
		};
		
		// Check if it's an alias (case-insensitive)
		const lowerName = modelName.toLowerCase();
		if (aliases[lowerName]) {
			return aliases[lowerName];
		}
		
		// Return as-is if not an alias
		return modelName;
	}

	/**
	 * Get RC configuration, loading it if needed
	 * @returns {object|null} RC configuration object
	 * @private
	 */
	getRCConfig() {
		if (!this._rcConfigLoaded) {
			this._rcConfigLoaded = true;
			try {
				const rcData = loadClaudeRC();
				if (rcData) {
					this._rcConfig = getEffectiveConfig(rcData);
					// Store raw aliases for command processing
					this._rcConfig.rawAliases = rcData.aliases;
				}
			} catch (error) {
				console.debug('Failed to load .clauderc:', error.message);
			}
		}
		return this._rcConfig;
	}

	/**
	 * Validates authentication parameters for Claude Code
	 * Claude Code doesn't require an API key, only the command to be available
	 *
	 * @param {object} params - Parameters to validate (unused)
	 * @override
	 * @description No-op for Claude Code as authentication is based on command availability,
	 * not API keys. Actual availability checking happens in isAvailable() method.
	 */
	validateAuth(params) {
		// Claude Code doesn't require an API key
		// Authentication is based on having the Claude Code command available
		// No validation needed here - availability check happens in isAvailable()
	}

	/**
	 * Attempts to detect Claude Code command in common locations
	 *
	 * @returns {string|null} Path to Claude Code executable or null if not found
	 * @private
	 * @description Searches for Claude Code in the following order:
	 * 1. PATH environment variable (using 'which' command)
	 * 2. Common installation paths for npm global packages
	 * 3. Platform-specific locations (macOS vs Linux)
	 * Results are cached to avoid repeated filesystem checks.
	 */
	detectClaudeCommand() {
		// If detection was already attempted, return cached result
		if (this._detectedCommand !== undefined) {
			return this._detectedCommand === false ? null : this._detectedCommand;
		}

		// Common locations to check for Claude Code based on npm installation paths
		const commonPaths = [];

		if (platform() === 'darwin') {
			// macOS paths
			commonPaths.push(
				'/Applications/Claude.app/Contents/MacOS/claude', // Claude app installation
				'/usr/local/bin/claude', // Homebrew Node.js global
				join(homedir(), '.claude', 'local', 'claude'), // User-specific installation
				join(homedir(), '.npm-global', 'bin', 'claude'), // User-specific npm
				'/usr/local/lib/node_modules/@anthropic-ai/claude-code/dist/claude.js'
			);
		} else {
			// Linux paths
			commonPaths.push(
				'/usr/bin/claude', // System-wide npm
				join(homedir(), '.claude', 'local', 'claude'), // User-specific installation
				join(homedir(), '.npm-global', 'bin', 'claude'), // User-specific npm
				'/usr/lib/node_modules/@anthropic-ai/claude-code/dist/claude.js'
			);
		}

		// First, try to find command in PATH using platform-specific command
		try {
			const isWindows = platform() === 'win32';
			const pathCommand = isWindows ? 'where claude' : 'which claude';
			const result = execSync(pathCommand, { encoding: 'utf8' }).trim();
			if (result && existsSync(result)) {
				this._detectedCommand = result;
				return result;
			}
		} catch (error) {
			// Command not found in PATH, continue with other methods
		}

		// Check common paths
		for (const path of commonPaths) {
			try {
				if (existsSync(path)) {
					// Verify it's executable
					accessSync(path, constants.F_OK | constants.X_OK);
					this._detectedCommand = path;
					return path;
				}
			} catch (error) {
				// Path doesn't exist or isn't executable, continue
			}
		}

		// Cache the negative result
		this._detectedCommand = false;
		return null;
	}

	/**
	 * Parses a command string into executable and arguments, respecting quoted strings
	 *
	 * @param {string} command - The command string to parse
	 * @returns {{executable: string, args: string[]}} Object containing executable path and arguments array
	 * @private
	 *
	 * @description Handles both single and double quotes, escape characters, and
	 * preserves spacing within quoted strings while splitting on spaces outside quotes.
	 *
	 * @example
	 * parseCommand('"/path with spaces/claude" --model opus')
	 * // Returns: { executable: '/path with spaces/claude', args: ['--model', 'opus'] }
	 *
	 * parseCommand("'C:\\Program Files\\Claude\\claude.exe' -p")
	 * // Returns: { executable: 'C:\\Program Files\\Claude\\claude.exe', args: ['-p'] }
	 */
	parseCommand(command) {
		const parts = [];
		let current = '';
		let inQuote = false;
		let quoteChar = null;
		let escapeNext = false;

		for (let i = 0; i < command.length; i++) {
			const char = command[i];

			if (escapeNext) {
				// Add escaped character as-is
				current += char;
				escapeNext = false;
				continue;
			}

			if (char === '\\') {
				// Check if this is escaping the next character
				if (
					i + 1 < command.length &&
					(command[i + 1] === '"' ||
						command[i + 1] === "'" ||
						command[i + 1] === '\\')
				) {
					escapeNext = true;
				} else {
					current += char;
				}
				continue;
			}

			if ((char === '"' || char === "'") && (!inQuote || char === quoteChar)) {
				if (!inQuote) {
					// Starting a quoted string
					inQuote = true;
					quoteChar = char;
				} else {
					// Ending a quoted string
					inQuote = false;
					quoteChar = null;
				}
				continue;
			}

			if (char === ' ' && !inQuote) {
				// Space outside quotes - this separates arguments
				if (current.length > 0) {
					parts.push(current);
					current = '';
				}
				continue;
			}

			// Regular character
			current += char;
		}

		// Don't forget the last part
		if (current.length > 0) {
			parts.push(current);
		}

		// First part is the executable, rest are arguments
		const executable = parts[0] || '';
		const args = parts.slice(1);

		return { executable, args };
	}

	/**
	 * Retrieves the Claude Code command from environment, parameters, RC file, or auto-detection
	 *
	 * @param {object} [params={}] - Optional parameters object
	 * @param {string} [params.claudeCodeCommand] - Claude Code command override
	 * @param {string} [params.modelId] - Model ID or alias ('opus', 'sonnet') to use
	 * @returns {string|null} The Claude Code command string with model flag if needed, or null if not configured
	 *
	 * @description Priority order for command resolution:
	 * 1. params.claudeCodeCommand (explicit override)
	 * 2. CLAUDE_CODE_COMMAND environment variable
	 * 3. .clauderc configuration file
	 * 4. Auto-detection via detectClaudeCommand()
	 *
	 * Model configuration priority:
	 * 1. params.modelId (can be an alias from .clauderc)
	 * 2. CLAUDE_CODE_MODEL environment variable
	 * 3. model setting in .clauderc
	 * 4. Existing --model flag in command
	 *
	 * @example
	 * // Get from environment or auto-detection
	 * const command = provider.getClaudeCommand();
	 *
	 * @example
	 * // Override with params
	 * const command = provider.getClaudeCommand({
	 *   claudeCodeCommand: '/custom/path/claude'
	 * });
	 *
	 * @example
	 * // Use with model parameter or alias
	 * const command = provider.getClaudeCommand({
	 *   modelId: 'opus'  // Will expand to full model name if alias exists
	 * });
	 */
	getClaudeCommand(params = {}) {
		// Get RC configuration
		const rcConfig = this.getRCConfig();

		// Priority order:
		// 1. Explicit parameter override
		// 2. Environment variable
		// 3. RC file configuration
		// 4. Auto-detection

		let baseCommand = null;

		if (params.claudeCodeCommand) {
			baseCommand = params.claudeCodeCommand;
		} else if (process.env.CLAUDE_CODE_COMMAND) {
			baseCommand = process.env.CLAUDE_CODE_COMMAND;
		} else if (rcConfig?.command) {
			baseCommand = rcConfig.command;
		} else {
			// Try auto-detection
			const detected = this.detectClaudeCommand();
			if (detected) {
				baseCommand = detected;
			}
		}

		if (!baseCommand) {
			return null;
		}

		// Check if we need to add model configuration
		// Priority: params.modelId > CLAUDE_CODE_MODEL env var > RC config
		let modelToUse = null;
		let modelArgs = null;

		if (params.modelId) {
			// Check if modelId is an alias
			if (rcConfig?.rawAliases && rcConfig.rawAliases[params.modelId]) {
				// If it's an alias, use the expanded value
				modelArgs = rcConfig.rawAliases[params.modelId];
			} else {
				// Resolve standard aliases like 'opus' -> 'claude-opus-4-20250514'
				modelToUse = this.resolveModelAlias(params.modelId);
			}
		} else if (process.env.CLAUDE_CODE_MODEL) {
			modelToUse = this.resolveModelAlias(process.env.CLAUDE_CODE_MODEL);
		} else if (rcConfig?.model) {
			modelToUse = this.resolveModelAlias(rcConfig.model);
		}

		// Apply aliases to the base command if RC config exists
		if (rcConfig?.rawAliases) {
			baseCommand = applyAliases(baseCommand, rcConfig.rawAliases);
		}

		// Check if command already includes --model flag
		const { executable, args } = this.parseCommand(baseCommand);
		const hasModelFlag = args.some(
			(arg, index) => arg === '--model' && index < args.length - 1
		);

		// Build final command
		let finalArgs = [...args];
		
		// Add model args from alias expansion
		if (modelArgs) {
			// Parse the model args and add them
			const { args: parsedModelArgs } = this.parseCommand(`dummy ${modelArgs}`);
			finalArgs.push(...parsedModelArgs);
		} else if (modelToUse && !hasModelFlag) {
			// Add simple model flag
			finalArgs.push('--model', modelToUse);
		}

		return `${executable}${finalArgs.length > 0 ? ' ' + finalArgs.join(' ') : ''}`;
	}

	/**
	 * Gets the parsed Claude command components (executable and arguments)
	 * This is used internally to avoid re-parsing issues with paths containing spaces
	 * 
	 * @param {object} [params={}] - Optional parameters
	 * @returns {{executable: string, args: string[]}|null} Parsed command components or null
	 * @private
	 */
	getClaudeCommandParsed(params = {}) {
		// Get RC configuration
		const rcConfig = this.getRCConfig();

		// Priority order:
		// 1. Explicit parameter override
		// 2. Environment variable
		// 3. RC file configuration
		// 4. Auto-detection

		let baseCommand = null;

		if (params.claudeCodeCommand) {
			baseCommand = params.claudeCodeCommand;
		} else if (process.env.CLAUDE_CODE_COMMAND) {
			baseCommand = process.env.CLAUDE_CODE_COMMAND;
		} else if (rcConfig?.command) {
			baseCommand = rcConfig.command;
		} else {
			// Try auto-detection
			const detected = this.detectClaudeCommand();
			if (detected) {
				baseCommand = detected;
			}
		}

		if (!baseCommand) {
			return null;
		}

		// Check if we need to add model configuration
		// Priority: params.modelId > CLAUDE_CODE_MODEL env var > RC config
		let modelToUse = null;
		let modelArgs = null;

		if (params.modelId) {
			// Check if modelId is an alias
			if (rcConfig?.rawAliases && rcConfig.rawAliases[params.modelId]) {
				// If it's an alias, use the expanded value
				modelArgs = rcConfig.rawAliases[params.modelId];
			} else {
				// Resolve standard aliases like 'opus' -> 'claude-opus-4-20250514'
				modelToUse = this.resolveModelAlias(params.modelId);
			}
		} else if (process.env.CLAUDE_CODE_MODEL) {
			modelToUse = this.resolveModelAlias(process.env.CLAUDE_CODE_MODEL);
		} else if (rcConfig?.model) {
			modelToUse = this.resolveModelAlias(rcConfig.model);
		}

		// Apply aliases to the base command if RC config exists
		if (rcConfig?.rawAliases) {
			baseCommand = applyAliases(baseCommand, rcConfig.rawAliases);
		}

		// Check if command already includes --model flag
		const { executable, args } = this.parseCommand(baseCommand);
		const hasModelFlag = args.some(
			(arg, index) => arg === '--model' && index < args.length - 1
		);

		// Build final command
		let finalArgs = [...args];
		
		// Add model args from alias expansion
		if (modelArgs) {
			// Parse the model args and add them
			const { args: parsedModelArgs } = this.parseCommand(`dummy ${modelArgs}`);
			finalArgs.push(...parsedModelArgs);
		} else if (modelToUse && !hasModelFlag) {
			// Add simple model flag
			finalArgs.push('--model', modelToUse);
		}

		return { executable, args: finalArgs };
	}

	/**
	 * Checks if Claude Code is available and properly configured
	 *
	 * @param {object} [params={}] - Optional parameters object
	 * @returns {boolean} True if Claude Code is available, false otherwise
	 */
	isAvailable(params = {}) {
		const command = this.getClaudeCommand(params);
		return command !== null;
	}

	/**
	 * Generates text using Claude Code
	 *
	 * @param {object} params - Parameters for text generation
	 * @param {Array<object>} params.messages - Array of message objects with role and content
	 * @param {string} params.messages[].role - Message role: 'system', 'user', or 'assistant'
	 * @param {string} params.messages[].content - Message content
	 * @param {number} [params.maxTokens] - Maximum tokens to generate (not supported by Claude Code CLI)
	 * @param {number} [params.temperature] - Temperature for generation (not supported by Claude Code CLI)
	 * @param {string} [params.modelId] - Model ID or alias ('opus', 'sonnet') to use with --model flag
	 * @returns {Promise<{text: string, usage: {promptTokens: number, completionTokens: number, totalTokens: number}, requestId: string, responseTime: number}>} Response object containing generated text and metadata
	 * @throws {Error} If messages array is empty or command execution fails
	 *
	 * @description Formats messages into Claude's expected prompt format and executes
	 * the Claude Code command. Token usage is always 0 as CLI doesn't provide counts.
	 *
	 * @example
	 * const response = await provider.generateText({
	 *   messages: [
	 *     { role: 'system', content: 'You are a helpful assistant' },
	 *     { role: 'user', content: 'Write a hello world function' }
	 *   ],
	 *   modelId: 'opus'  // Uses latest opus model
	 * });
	 */
	async generateText(params) {
		const startTime = Date.now();
		const requestId = randomUUID();

		try {
			const { messages, modelId } = params;

			if (!messages || messages.length === 0) {
				throw new Error('Messages array is required for text generation.');
			}

			// Format messages into a prompt
			let prompt = messages
				.map((msg) => {
					if (msg.role === 'system') {
						return `System: ${msg.content}`;
					} else if (msg.role === 'user') {
						return `Human: ${msg.content}`;
					} else if (msg.role === 'assistant') {
						return `Assistant: ${msg.content}`;
					}
					return '';
				})
				.join('\n\n');

			// Add final prompt for assistant
			if (messages[messages.length - 1].role !== 'assistant') {
				prompt += '\n\nAssistant:';
			}

			// Execute Claude Code with model configuration
			const result = await this.executeClaudeCode(prompt, { modelId });

			return {
				text: result,
				usage: {
					promptTokens: 0, // Claude Code doesn't provide token counts
					completionTokens: 0,
					totalTokens: 0
				},
				requestId,
				responseTime: Date.now() - startTime
			};
		} catch (error) {
			this.handleError('text generation', error);
		}
	}

	/**
	 * Streaming is not supported by Claude Code
	 *
	 * @param {object} params - Parameters for text streaming (unused)
	 * @throws {Error} Always throws error as streaming is not supported
	 * @override
	 */
	async streamText(params) {
		throw new Error(
			'Streaming is not supported by Claude Code provider. Use generateText instead.'
		);
	}

	/**
	 * Generates a structured object using Claude Code
	 *
	 * Works by appending JSON generation instructions to the user prompt
	 * and parsing the response as JSON.
	 *
	 * @param {object} params - Parameters for object generation
	 * @param {Array<object>} params.messages - Array of message objects
	 * @param {object} [params.schema] - JSON schema for the object (reserved for future use)
	 * @param {string} [params.objectName='object'] - Name/description of the object to generate
	 * @param {number} [params.maxTokens] - Maximum tokens to generate (not supported by Claude Code CLI)
	 * @param {number} [params.temperature] - Temperature for generation (not supported by Claude Code CLI)
	 * @returns {Promise<{object: any, usage: {promptTokens: number, completionTokens: number, totalTokens: number}, requestId: string, responseTime: number}>} Response object with parsed JSON
	 * @throws {Error} If JSON parsing fails or command execution fails
	 *
	 * @example
	 * const response = await provider.generateObject({
	 *   messages: [{ role: 'user', content: 'Generate a user profile' }],
	 *   objectName: 'UserProfile',
	 *   schema: { type: 'object', properties: { name: { type: 'string' } } }
	 * });
	 * console.log(response.object); // { name: 'John Doe', ... }
	 */
	async generateObject(params) {
		const startTime = Date.now();
		const requestId = randomUUID();

		try {
			const { messages, objectName = 'object' } = params;

			// Modify the last user message to request JSON output
			const modifiedMessages = [...messages];
			const lastMessage = modifiedMessages[modifiedMessages.length - 1];

			if (lastMessage && lastMessage.role === 'user') {
				lastMessage.content += `\n\nIMPORTANT: Your response MUST be valid JSON that matches this structure: ${objectName}\n\nRespond ONLY with the JSON object, no explanation, no markdown, just the raw JSON.`;
			}

			// Use generateText to get the response
			const textResult = await this.generateText({
				...params,
				messages: modifiedMessages
			});

			// Parse the JSON response
			try {
				let jsonText = textResult.text.trim();

				// Remove markdown code blocks if present
				jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

				// Find JSON object boundaries
				const firstBrace = jsonText.indexOf('{');
				const lastBrace = jsonText.lastIndexOf('}');
				if (firstBrace !== -1 && lastBrace !== -1) {
					jsonText = jsonText.substring(firstBrace, lastBrace + 1);
				}

				const parsedObject = JSON.parse(jsonText);

				return {
					object: parsedObject,
					usage: textResult.usage,
					requestId,
					responseTime: Date.now() - startTime
				};
			} catch (parseError) {
				throw new Error(
					`Failed to parse JSON from Claude Code response: ${parseError.message}`
				);
			}
		} catch (error) {
			this.handleError('object generation', error);
		}
	}

	/**
	 * Executes the Claude Code command with the given input
	 *
	 * This method handles the low-level execution of the Claude Code command,
	 * including temporary file creation, command validation, and timeout handling.
	 *
	 * @param {string} input - The formatted prompt text to send to Claude
	 * @param {object} [options={}] - Optional execution options
	 * @param {string} [options.modelId] - Model ID or alias to use with --model flag
	 * @returns {Promise<string>} The raw text response from Claude Code
	 * @throws {Error} If command is not set, not found, times out (5 minutes), or returns error
	 * @private
	 *
	 * @description
	 * The method performs the following steps:
	 * 1. Retrieves command with model configuration via getClaudeCommand()
	 * 2. Validates the Claude Code command exists and is executable
	 * 3. Handles file reference mode for large PRDs if enabled
	 * 4. Adds -p flag for print mode if not present
	 * 5. Creates a temporary file with the prompt
	 * 6. Executes the command with input redirection
	 * 7. Implements 5-minute timeout for long-running requests
	 * 8. Cleans up the temporary file
	 *
	 * Environment variables:
	 * - CLAUDE_CODE_COMMAND: The Claude Code command to execute
	 * - CLAUDE_CODE_USE_FILE_REFERENCE: Enable file reference mode for large inputs
	 * - CLAUDE_CODE_MODEL: Default model to use if not specified in params
	 */
	async executeClaudeCode(input, options = {}) {
		// Apply any environment variables from RC config
		const rcConfig = this.getRCConfig();
		if (rcConfig?.environment) {
			// Apply RC config environment variables (they don't override existing ones)
			for (const [key, value] of Object.entries(rcConfig.environment)) {
				if (!process.env[key]) {
					process.env[key] = value;
				}
			}
		}

		const parsedCommand = this.getClaudeCommandParsed(options);
		let tempFile;

		try {
			if (!parsedCommand) {
				throw new Error(
					'Claude Code not found. Please install Claude Code:\n' +
						'  - Download from: https://claude.ai/code\n' +
						'  - Install via npm: npm install -g @anthropic-ai/claude-code\n' +
						'  - Or set CLAUDE_CODE_COMMAND environment variable\n' +
						'  - Or create a .clauderc file with your configuration\n' +
						'  - Example: export CLAUDE_CODE_COMMAND="/path/to/claude"'
				);
			}

			// Check if we should use file reference mode
			const useFileReference =
				process.env.CLAUDE_CODE_USE_FILE_REFERENCE === 'true';

			// Check if input contains file path marker
			let actualInput = input;
			if (useFileReference) {
				// Check if the input contains a file path reference
				const filePathMatch = input.match(/FILE_PATH:\s*(.+?)(?:\n|$)/);
				if (filePathMatch) {
					const filePath = filePathMatch[1].trim();
					// Replace the PRD content with a file reference
					actualInput = input.replace(
						/Product Requirements Document \(PRD\) Content:[\s\S]*?(?=\n\nIMPORTANT:|$)/,
						`Product Requirements Document (PRD) Content:\n<Please read the PRD from this file: ${filePath}>`
					);
				}
			}

			// Use the already parsed command components
			const { executable: claudePath, args: parsedArgs } = parsedCommand;
			let args = [...parsedArgs];

			// Add -p flag if not already present (required for piped input)
			// Add it at the beginning to maintain expected order
			if (!args.includes('-p') && !args.includes('--print')) {
				args.unshift('-p');
			}

			// Validate the command exists and is executable
			try {
				accessSync(claudePath, constants.F_OK | constants.X_OK);
			} catch (error) {
				throw new Error(
					`Claude Code not found or not executable at: ${claudePath}. Please check your CLAUDE_CODE_COMMAND environment variable.`
				);
			}

			// Create a temporary file for the prompt
			tempFile = join(tmpdir(), `claude-prompt-${Date.now()}.txt`);
			writeFileSync(tempFile, actualInput, 'utf8');

			// Execute the command using spawn for better security
			return new Promise((resolve, reject) => {
				const child = spawn(claudePath, args, {
					stdio: ['pipe', 'pipe', 'pipe']
				});

				let stdout = '';
				let stderr = '';
				const timeout = setTimeout(
					() => {
						child.kill();
						reject(new Error('Claude Code timed out after 5 minutes'));
					},
					5 * 60 * 1000
				);

				// Read from temp file and pipe to stdin
				const readStream = createReadStream(tempFile);
				readStream.pipe(child.stdin);

				child.stdout.on('data', (data) => {
					stdout += data.toString();
				});

				child.stderr.on('data', (data) => {
					stderr += data.toString();
				});

				child.on('close', (code) => {
					clearTimeout(timeout);
					if (code !== 0) {
						reject(new Error(`Claude Code error (code ${code}): ${stderr}`));
					} else if (stderr && !stdout) {
						reject(new Error(`Claude Code error: ${stderr}`));
					} else {
						resolve(stdout.trim());
					}
				});

				child.on('error', (error) => {
					clearTimeout(timeout);
					reject(error);
				});
			});
		} catch (error) {
			throw error;
		} finally {
			// Clean up temp file
			if (tempFile) {
				try {
					unlinkSync(tempFile);
				} catch (e) {
					// Ignore cleanup errors
				}
			}
		}
	}

	/**
	 * Get client instance (not applicable for Claude Code)
	 *
	 * This method is required by the BaseAIProvider interface but is not
	 * applicable for the Claude Code provider since it uses command-line
	 * execution rather than an API client.
	 *
	 * @returns {null} Always returns null as no client instance is needed
	 * @override
	 *
	 * @description
	 * The Claude Code provider executes commands directly via child_process
	 * rather than maintaining a persistent client connection. This method
	 * exists only for interface compatibility with other AI providers.
	 */
	getClient() {
		return null;
	}

	/**
	 * Validates the Claude Code setup and configuration
	 *
	 * This method performs a minimal validation by sending a simple "Hi" prompt
	 * and categorizing any errors that occur. It provides specific remediation
	 * instructions for each error type.
	 *
	 * @param {object} [params={}] - Optional parameters object
	 * @param {string} [params.claudeCodeCommand] - Claude Code command override
	 * @returns {Promise<{isValid: boolean, errors: Array<{type: string, message: string, fix?: string}>, warnings: Array<{type: string, message: string}>}>} Validation result
	 *
	 * @description Error types returned:
	 * - INSTALL: Claude Code not found or needs installation
	 * - PERMISSION: Insufficient permissions to execute
	 * - SUBSCRIPTION: Usage limits or subscription issues
	 * - NETWORK: Network connectivity problems
	 * - UNKNOWN: Other unexpected errors
	 *
	 * @example
	 * const result = await provider.validate();
	 * if (!result.isValid) {
	 *   console.error('Setup errors:', result.errors);
	 *   result.errors.forEach(error => {
	 *     console.log(`Fix: ${error.fix}`);
	 *   });
	 * }
	 */
	async validate(params = {}) {
		const errors = [];
		const warnings = [];
		let isValid = true;

		try {
			// Check if command is available
			const command = this.getClaudeCommand(params);
			if (!command) {
				errors.push({
					type: 'INSTALL',
					message: 'Claude Code not found',
					fix: 'Install Claude Code: npm install -g @anthropic-ai/claude-code'
				});
				isValid = false;
				return { isValid, errors, warnings };
			}

			// Parse command to get executable path
			const { executable } = this.parseCommand(command);

			// Check if executable exists and has correct permissions
			try {
				accessSync(executable, constants.F_OK | constants.X_OK);
			} catch (error) {
				if (error.code === 'ENOENT') {
					errors.push({
						type: 'INSTALL',
						message: `Claude Code not found at: ${executable}`,
						fix: 'Install Claude Code: npm install -g @anthropic-ai/claude-code'
					});
				} else if (error.code === 'EACCES') {
					errors.push({
						type: 'PERMISSION',
						message: `Permission denied for: ${executable}`,
						fix: `Make executable: sudo chmod +x ${executable}`
					});
				} else {
					errors.push({
						type: 'UNKNOWN',
						message: `Cannot access Claude Code: ${error.message}`,
						fix: 'Check installation and permissions'
					});
				}
				isValid = false;
				return { isValid, errors, warnings };
			}

			// Attempt to execute a simple test prompt with 30-second timeout
			const testPrompt = 'Hi';
			const timeout = 30000; // 30 seconds

			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => {
					reject(new Error('TIMEOUT'));
				}, timeout);
			});

			try {
				await Promise.race([
					this.executeClaudeCode(testPrompt),
					timeoutPromise
				]);
			} catch (error) {
				const errorMessage = error.message || error.toString();

				// Categorize the error
				if (error.message === 'TIMEOUT') {
					errors.push({
						type: 'SUBSCRIPTION',
						message: 'Claude Code did not respond within 30 seconds',
						fix: 'Ensure you have an active Claude PRO or MAX subscription'
					});
				} else if (
					errorMessage.includes('usage limit') ||
					errorMessage.includes('rate limit')
				) {
					// Extract reset time if available
					const resetMatch = errorMessage.match(/resets? (?:at|in) ([^.]+)/i);
					const resetInfo = resetMatch ? ` (resets ${resetMatch[1]})` : '';
					errors.push({
						type: 'SUBSCRIPTION',
						message: `Usage limit reached${resetInfo}`,
						fix: 'Wait for limit reset or upgrade your Claude subscription'
					});
				} else if (
					errorMessage.includes('ENETUNREACH') ||
					errorMessage.includes('network')
				) {
					errors.push({
						type: 'NETWORK',
						message: 'Network unreachable',
						fix: 'Check your internet connection and try again'
					});
				} else if (errorMessage.includes('EACCES')) {
					errors.push({
						type: 'PERMISSION',
						message: `Permission denied: ${errorMessage}`,
						fix: `Check file permissions or run with elevated privileges`
					});
				} else if (errorMessage.includes('ENOENT')) {
					errors.push({
						type: 'INSTALL',
						message: 'Claude Code executable not found during execution',
						fix: 'Reinstall Claude Code: npm install -g @anthropic-ai/claude-code'
					});
				} else {
					errors.push({
						type: 'UNKNOWN',
						message: `Claude Code error: ${errorMessage}`,
						fix: 'Check Claude Code logs or try reinstalling'
					});
				}
				isValid = false;
			}
		} catch (error) {
			// Catch any unexpected errors
			errors.push({
				type: 'UNKNOWN',
				message: `Unexpected error during validation: ${error.message}`,
				fix: 'Check system logs and Claude Code installation'
			});
			isValid = false;
		}

		return { isValid, errors, warnings };
	}

	/**
	 * Alias for validate() method for consistency with other providers
	 *
	 * @param {object} [params={}] - Optional parameters object
	 * @returns {Promise<{isValid: boolean, errors: Array<{type: string, message: string, fix?: string}>, warnings: Array<{type: string, message: string}>}>} Validation result
	 */
	async checkSetup(params = {}) {
		return this.validate(params);
	}
}
