/**
 * claude-cli.js
 * AI provider implementation for Claude CLI using subprocess execution.
 * This provider runs the Claude Code CLI in print mode to get responses.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseAIProvider } from './base-provider.js';
import { log, resolveEnvVariable } from '../../scripts/modules/utils.js';

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
		// Add file logging for debugging
		const { createFileLogger } = await import('../../mcp-server/src/file-logger.js');
		const fileLog = createFileLogger(console);
		
		let command = this.getClaudeCommand();
		fileLog.info('[CLAUDE-CLI] executeClaudeCli called');
		fileLog.info('[CLAUDE-CLI] Getting command from environment...');
		fileLog.info(`[CLAUDE-CLI] CLAUDE_CLI_COMMAND = ${command || 'NOT SET'}`);
		log('info', '[CLAUDE-CLI] Getting command from environment...');
		log('info', `[CLAUDE-CLI] CLAUDE_CLI_COMMAND = ${command || 'NOT SET'}`);
		
		if (!command) {
			fileLog.error('[CLAUDE-CLI] CLAUDE_CLI_COMMAND environment variable is not set');
			log('error', '[CLAUDE-CLI] CLAUDE_CLI_COMMAND environment variable is not set');
			throw new Error('CLAUDE_CLI_COMMAND environment variable is not set');
		}
		
		// Check if we should use file reference mode
		const useFileReference = resolveEnvVariable('CLAUDE_CLI_USE_FILE_REFERENCE') === 'true';
		fileLog.info(`[CLAUDE-CLI] CLAUDE_CLI_USE_FILE_REFERENCE = ${useFileReference}`);
		
		// Check if input contains file path marker
		let actualInput = input;
		if (useFileReference && input.includes('PRD_FILE_PATH:')) {
			// Extract file path from input
			const filePathMatch = input.match(/PRD_FILE_PATH:\s*([^\n]+)/);
			if (filePathMatch) {
				const filePath = filePathMatch[1].trim();
				fileLog.info(`[CLAUDE-CLI] File reference mode: Detected file path: ${filePath}`);
				
				// Replace the PRD content with a file reference
				actualInput = input.replace(/Product Requirements Document \(PRD\) Content:[\s\S]*?(?=\n\nIMPORTANT:|$)/, 
					`Product Requirements Document (PRD) Content:\n<Please read the PRD from this file: ${filePath}>`);
				
				fileLog.info(`[CLAUDE-CLI] Replaced PRD content with file reference`);
				fileLog.info(`[CLAUDE-CLI] New input length: ${actualInput.length} (was ${input.length})`);
			}
		}
		
		// Add -p flag if not already present (required for piped input)
		if (!command.includes(' -p') && !command.includes('--print')) {
			fileLog.info('[CLAUDE-CLI] Adding -p flag to command');
			log('info', '[CLAUDE-CLI] Adding -p flag to command');
			command += ' -p';
		}
		
		// Validate the command exists
		const claudePath = command.split(' ')[0];
		fileLog.info(`[CLAUDE-CLI] Checking if Claude CLI exists at: ${claudePath}`);
		
		try {
			await execAsync(`test -f "${claudePath}" && test -x "${claudePath}"`);
			fileLog.info('[CLAUDE-CLI] Claude CLI found and is executable');
		} catch (error) {
			fileLog.error(`[CLAUDE-CLI] Claude CLI not found or not executable at: ${claudePath}`);
			throw new Error(`Claude CLI not found or not executable at: ${claudePath}. Please check your CLAUDE_CLI_COMMAND environment variable.`);
		}
		
		fileLog.info(`[CLAUDE-CLI] Final command: ${command}`);
		log('info', `[CLAUDE-CLI] Final command: ${command}`);
		log('info', `[CLAUDE-CLI] Input length: ${actualInput.length} characters`);
		log('debug', `[CLAUDE-CLI] Input preview: ${actualInput.substring(0, 200)}...`);
		
		let tempFile;
		try {
			fileLog.info('[CLAUDE-CLI] About to execute command...');
			fileLog.info(`[CLAUDE-CLI] Command: ${command}`);
			fileLog.info(`[CLAUDE-CLI] Input: ${actualInput.substring(0, 500)}...`);
			log('info', '[CLAUDE-CLI] Executing command...');
			const startTime = Date.now();
			
			// For file reference mode, include the full PRD content in the prompt
			let finalInput = actualInput;
			if (useFileReference && actualInput.includes('<Please read the PRD from this file:')) {
				// Extract the file path
				const filePathMatch = actualInput.match(/<Please read the PRD from this file:\s*([^>]+)>/);
				if (filePathMatch) {
					const prdFilePath = filePathMatch[1].trim();
					fileLog.info(`[CLAUDE-CLI] Reading PRD content from: ${prdFilePath}`);
					
					try {
						const { readFileSync } = await import('fs');
						const prdContent = readFileSync(prdFilePath, 'utf8');
						finalInput = actualInput.replace(
							/<Please read the PRD from this file:\s*[^>]+>/,
							prdContent
						);
						fileLog.info(`[CLAUDE-CLI] Included PRD content, new length: ${finalInput.length}`);
					} catch (readError) {
						fileLog.error(`[CLAUDE-CLI] Failed to read PRD file: ${readError.message}`);
						// Continue with file reference if read fails
					}
				}
			}
			
			// Create a temporary file for the prompt
			const { writeFileSync, unlinkSync } = await import('fs');
			const { tmpdir } = await import('os');
			const { join } = await import('path');
			tempFile = join(tmpdir(), `claude-prompt-${Date.now()}.txt`);
			
			fileLog.info(`[CLAUDE-CLI] Writing prompt to temporary file: ${tempFile}`);
			writeFileSync(tempFile, finalInput, 'utf8');
			
			// Use the temporary file as input
			const fullCommand = `${command} < ${tempFile}`;
			fileLog.info(`[CLAUDE-CLI] Using temporary file for input`);
			
			// Add timeout to prevent hanging
			const timeout = 300000; // 5 minutes timeout (increased for Claude processing)
			fileLog.info(`[CLAUDE-CLI] Setting execution timeout to ${timeout}ms`);
			
			let stdout, stderr;
			try {
				const result = await Promise.race([
					execAsync(fullCommand, {
						maxBuffer: 10 * 1024 * 1024, // 10MB buffer
						encoding: 'utf8',
						timeout: timeout
					}),
					new Promise((_, reject) => 
						setTimeout(() => reject(new Error('Claude CLI execution timed out after 5 minutes')), timeout)
					)
				]);
				stdout = result.stdout;
				stderr = result.stderr;
			} catch (execError) {
				fileLog.error(`[CLAUDE-CLI] Execution failed: ${execError.message}`);
				
				// Check if it's a timeout
				if (execError.message.includes('timed out')) {
					throw new Error('Claude CLI execution timed out. The command may be hanging or taking too long to respond.');
				}
				
				// Check if it's a command not found error
				if (execError.code === 'ENOENT') {
					throw new Error(`Claude CLI not found at: ${command.split(' ')[0]}`);
				}
				
				// Check for other specific error codes
				if (execError.code) {
					fileLog.error(`[CLAUDE-CLI] Error code: ${execError.code}`);
				}
				
				throw new Error(`Claude CLI execution failed: ${execError.message}`);
			}
			
			const duration = Date.now() - startTime;
			fileLog.info(`[CLAUDE-CLI] Command completed in ${duration}ms`);
			log('info', `[CLAUDE-CLI] Command completed in ${duration}ms`);
			
			if (stderr) {
				fileLog.warn(`[CLAUDE-CLI] stderr: ${stderr}`);
				log('warn', `[CLAUDE-CLI] stderr: ${stderr}`);
			}
			
			fileLog.info(`[CLAUDE-CLI] stdout length: ${stdout ? stdout.length : 0} characters`);
			log('info', `[CLAUDE-CLI] stdout length: ${stdout ? stdout.length : 0} characters`);
			
			if (!stdout || stdout.length === 0) {
				fileLog.error('[CLAUDE-CLI] No output received from Claude CLI');
				throw new Error('Claude CLI returned no output. The command may not support non-interactive mode.');
			}
			
			// Log more of stdout for debugging
			fileLog.info(`[CLAUDE-CLI] stdout preview: ${stdout.substring(0, 500)}...`);
			log('debug', `[CLAUDE-CLI] stdout preview: ${stdout.substring(0, 200)}...`);
			
			return stdout;
		} catch (error) {
			log('error', `[CLAUDE-CLI] Command execution failed: ${error.message}`);
			log('error', `[CLAUDE-CLI] Error code: ${error.code}`);
			log('error', `[CLAUDE-CLI] Error stack: ${error.stack}`);
			
			// Enhanced error logging
			if (error.code === 'ENOENT') {
				throw new Error(
					`Claude CLI command '${command}' not found. Please ensure Claude Code is installed and the CLAUDE_CLI_COMMAND is correct.`
				);
			}
			
			throw new Error(`Claude CLI execution failed: ${error.message}`);
		} finally {
			// Clean up temporary file
			if (tempFile) {
				try {
					const { unlinkSync } = await import('fs');
					fileLog.info(`[CLAUDE-CLI] Cleaning up temporary file: ${tempFile}`);
					unlinkSync(tempFile);
				} catch (cleanupError) {
					fileLog.warn(`[CLAUDE-CLI] Failed to clean up temp file: ${cleanupError.message}`);
				}
			}
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
		log('info', '[CLAUDE-CLI] generateText called');
		log('debug', `[CLAUDE-CLI] params: ${JSON.stringify(params, null, 2)}`);
		
		try {
			log('info', '[CLAUDE-CLI] Validating parameters...');
			this.validateParams(params);
			this.validateMessages(params.messages);
			log('info', '[CLAUDE-CLI] Parameters validated successfully');

			log('info', `[CLAUDE-CLI] Generating text via Claude CLI`);
			log('info', `[CLAUDE-CLI] Number of messages: ${params.messages.length}`);

			const prompt = this.formatPrompt(params.messages);
			log('info', `[CLAUDE-CLI] Formatted prompt length: ${prompt.length}`);
			
			const result = await this.executeClaudeCli(prompt);

			log('info', `[CLAUDE-CLI] Text generation completed successfully`);
			log('info', `[CLAUDE-CLI] Result length: ${result.length}`);

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
			log('error', `[CLAUDE-CLI] Error in generateText: ${error.message}`);
			log('error', `[CLAUDE-CLI] Error stack: ${error.stack}`);
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