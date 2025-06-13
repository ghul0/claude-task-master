#!/usr/bin/env node

// Direct import to avoid circular dependency
import { BaseAIProvider } from './src/ai-providers/base-provider.js';

// Manually define ClaudeCodeAIProvider for testing
class TestClaudeCodeAIProvider extends BaseAIProvider {
	constructor() {
		super();
		this.name = 'Claude Code';
		this.supportsStreaming = false;
		this.supportsObjectGeneration = true;
		this._detectedCommand = undefined;
		this._modelAliases = {
			'opus': 'claude-opus-4-20250514',
			'sonnet': 'claude-sonnet-4-20250514'
		};
	}

	resolveModelAlias(modelName) {
		if (!modelName) return null;
		
		const normalized = modelName.toLowerCase();
		if (this._modelAliases[normalized]) {
			return this._modelAliases[normalized];
		}
		
		return modelName;
	}

	parseCommand(command) {
		const parts = [];
		let current = '';
		let inQuote = false;
		let quoteChar = null;
		let escapeNext = false;
		
		for (let i = 0; i < command.length; i++) {
			const char = command[i];
			
			if (escapeNext) {
				current += char;
				escapeNext = false;
				continue;
			}
			
			if (char === '\\') {
				if (i + 1 < command.length && (command[i + 1] === '"' || command[i + 1] === "'" || command[i + 1] === '\\')) {
					escapeNext = true;
				} else {
					current += char;
				}
				continue;
			}
			
			if ((char === '"' || char === "'") && (!inQuote || char === quoteChar)) {
				if (!inQuote) {
					inQuote = true;
					quoteChar = char;
				} else {
					inQuote = false;
					quoteChar = null;
				}
				continue;
			}
			
			if (char === ' ' && !inQuote) {
				if (current.length > 0) {
					parts.push(current);
					current = '';
				}
				continue;
			}
			
			current += char;
		}
		
		if (current.length > 0) {
			parts.push(current);
		}
		
		const executable = parts[0] || '';
		const args = parts.slice(1);
		
		return { executable, args };
	}

	getClaudeCommand(params = {}) {
		let baseCommand = null;
		
		if (params.claudeCodeCommand) {
			baseCommand = params.claudeCodeCommand;
		} else if (process.env.CLAUDE_CODE_COMMAND) {
			baseCommand = process.env.CLAUDE_CODE_COMMAND;
		} else {
			// For testing, just return a default
			baseCommand = 'claude';
		}
		
		if (!baseCommand) {
			return null;
		}
		
		let modelToUse = null;
		
		if (params.modelId) {
			modelToUse = this.resolveModelAlias(params.modelId);
		} else if (process.env.CLAUDE_CODE_MODEL) {
			modelToUse = this.resolveModelAlias(process.env.CLAUDE_CODE_MODEL);
		}
		
		const { executable, args } = this.parseCommand(baseCommand);
		const hasModelFlag = args.some((arg, index) => 
			arg === '--model' && index < args.length - 1
		);
		
		if (modelToUse && !hasModelFlag) {
			const allArgs = [...args, '--model', modelToUse];
			return `${executable}${allArgs.length > 0 ? ' ' + allArgs.join(' ') : ''}`;
		}
		
		return baseCommand;
	}
}

console.log('Testing Claude Code Model Configuration...\n');

const provider = new TestClaudeCodeAIProvider();

// Test 1: Model alias resolution
console.log('Test 1: Model Alias Resolution');
console.log('opus ->', provider.resolveModelAlias('opus'));
console.log('sonnet ->', provider.resolveModelAlias('sonnet'));
console.log('custom-model ->', provider.resolveModelAlias('custom-model'));
console.log('');

// Test 2: Command parsing
console.log('Test 2: Command Parsing');
const parsed = provider.parseCommand('"/path with spaces/claude" --model opus');
console.log('Parsed:', parsed);
console.log('');

// Test 3: Model configuration with env var
console.log('Test 3: Model Configuration with CLAUDE_CODE_MODEL');
process.env.CLAUDE_CODE_COMMAND = 'claude';
process.env.CLAUDE_CODE_MODEL = 'opus';
console.log('Command:', provider.getClaudeCommand());
console.log('');

// Test 4: Model configuration with params
console.log('Test 4: Model Configuration with params.modelId');
delete process.env.CLAUDE_CODE_MODEL;
console.log('Command:', provider.getClaudeCommand({ modelId: 'sonnet' }));
console.log('');

// Test 5: Priority test
console.log('Test 5: Priority (params > env)');
process.env.CLAUDE_CODE_MODEL = 'opus';
console.log('Command:', provider.getClaudeCommand({ modelId: 'sonnet' }));
console.log('');

// Test 6: Existing model flag
console.log('Test 6: Existing model flag in command');
process.env.CLAUDE_CODE_COMMAND = 'claude --model claude-3-5-sonnet-20241022';
process.env.CLAUDE_CODE_MODEL = 'opus';
console.log('Command:', provider.getClaudeCommand());
console.log('');

console.log('All tests completed!');