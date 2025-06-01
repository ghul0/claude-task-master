/**
 * claude-cli.js
 * AI provider implementation for Claude CLI using subprocess execution.
 * This provider runs the Claude Code CLI in print mode to get responses.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseAIProvider } from './base-provider.js';
import { log, resolveEnvVariable } from '../../scripts/modules/index.js';

const execAsync = promisify(exec);

export class ClaudeCliAIProvider extends BaseAIProvider {
	constructor() {
		super();
		this.name = 'Claude CLI';
	}

	/**
	 * Override auth validation - Claude CLI doesn't require API keys
	 * @param {object} params - Parameters to validate
	 */
	validateAuth(_params) {
		// Claude CLI uses the system's Claude Code installation
		// No API key needed as authentication is handled by Claude Code itself
	}

	/**
	 * Override parameter validation to check for CLAUDE_CLI_COMMAND
	 * @param {object} params - Parameters to validate
	 */
	validateParams(params) {
		// Get command from environment
		const command = this.getClaudeCommand();
		if (!command) {
			throw new Error(
				'CLAUDE_CLI_COMMAND environment variable is not set. Please set it to your Claude CLI command (e.g., "claude")'
			);
		}

		// Call parent validation (will skip auth check due to our override)
		super.validateParams(params);
	}

	/**
	 * Gets the Claude CLI command from environment
	 * @returns {string|null} The command or null if not set
	 */
	getClaudeCommand() {
		return resolveEnvVariable('CLAUDE_CLI_COMMAND');
	}

	/**
	 * Not used for CLI provider, but required by base class
	 */
	getClient(_params) {
		// Claude CLI doesn't use a client pattern
		return null;
	}

	/**
	 * Executes Claude CLI with the given input
	 * @private
	 */
	async executeClaudeCli(input) {
		let command = this.getClaudeCommand();
		if (!command) {
			throw new Error('CLAUDE_CLI_COMMAND environment variable is not set');
		}
		
		// Add -p flag if not already present (required for piped input)
		if (!command.includes(' -p') && !command.includes('--print')) {
			command += ' -p';
		}
		
		try {
			const { stdout, stderr } = await execAsync(command, {
				input,
				maxBuffer: 10 * 1024 * 1024, // 10MB buffer
				encoding: 'utf8'
			});
			
			if (stderr) {
				log('warn', `Claude CLI stderr: ${stderr}`);
			}
			
			return stdout;
		} catch (error) {
			// Enhanced error logging
			if (error.code === 'ENOENT') {
				throw new Error(
					`Claude CLI command '${command}' not found. Please ensure Claude Code is installed and the CLAUDE_CLI_COMMAND is correct.`
				);
			}
			
			throw new Error(`Claude CLI execution failed: ${error.message}`);
		}
	}

	/**
	 * Formats messages into a prompt for Claude CLI
	 * @private
	 */
	formatPrompt(messages) {
		let prompt = '';
		
		for (const msg of messages) {
			if (msg.role === 'system') {
				prompt += `System: ${msg.content}\n\n`;
			} else if (msg.role === 'user') {
				prompt += `User: ${msg.content}\n\n`;
			} else if (msg.role === 'assistant') {
				prompt += `Assistant: ${msg.content}\n\n`;
			}
		}
		
		// Remove trailing newlines and add prompt for Claude
		return prompt.trim() + '\n\nAssistant:';
	}

	/**
	 * Generates text using Claude CLI
	 */
	async generateText(params) {
		try {
			this.validateParams(params);
			this.validateMessages(params.messages);

			log('debug', `Generating text via Claude CLI`);

			const prompt = this.formatPrompt(params.messages);
			const result = await this.executeClaudeCli(prompt);

			log('debug', `Claude CLI text generation completed successfully`);

			// Note: Claude CLI doesn't provide token usage information
			return {
				text: result.trim(),
				usage: {
					inputTokens: undefined,
					outputTokens: undefined,
					totalTokens: undefined
				}
			};
		} catch (error) {
			this.handleError('text generation', error);
		}
	}

	/**
	 * Streaming is not supported for CLI provider
	 */
	async streamText(_params) {
		throw new Error(
			'Text streaming is not supported by Claude CLI provider. Use generateText instead.'
		);
	}

	/**
	 * Object generation through CLI would require parsing, which is unreliable
	 */
	async generateObject(_params) {
		throw new Error(
			'Object generation is not supported by Claude CLI provider. Use generateText and parse the response manually.'
		);
	}
}