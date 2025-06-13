import { jest } from '@jest/globals';

// Mock scripts/modules/index.js to avoid circular dependency issues
jest.mock('../../scripts/modules/index.js', () => ({
	log: jest.fn((level, message, ...args) => {
		// Simple mock implementation that matches the actual log function signature
		console.log(`[MOCK ${level}] ${message}`, ...args);
	})
}));

// Mock the base provider to avoid circular dependencies
jest.mock('../../src/ai-providers/base-provider.js', () => ({
	BaseAIProvider: class {
		constructor() {
			this.name = 'Base';
			this.supportsStreaming = false;
			this.supportsObjectGeneration = false;
		}
		handleError(operation, error) {
			throw error;
		}
	}
}));

// Mock file system and other dependencies
jest.mock('fs', () => ({
	existsSync: jest.fn(() => false),
	accessSync: jest.fn(),
	writeFileSync: jest.fn(),
	unlinkSync: jest.fn(),
	createReadStream: jest.fn(),
	readFileSync: jest.fn(),
	constants: { F_OK: 0, X_OK: 1 }
}));

jest.mock('os', () => ({
	tmpdir: jest.fn(() => '/tmp'),
	platform: jest.fn(() => 'linux'),
	homedir: jest.fn(() => '/home/user')
}));

jest.mock('child_process', () => ({
	execSync: jest.fn(() => { throw new Error('not found'); }),
	spawn: jest.fn()
}));

import { ClaudeCodeAIProvider } from '../../src/ai-providers/claude-code.js';

describe('Claude Code Model Configuration', () => {
	let originalEnv;

	beforeEach(() => {
		originalEnv = { ...process.env };
		// Clear relevant environment variables
		delete process.env.CLAUDE_CODE_COMMAND;
		delete process.env.CLAUDE_CODE_MODEL;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe('Model Alias Resolution', () => {
		test('should support model aliases', () => {
			const provider = new ClaudeCodeAIProvider();
			
			expect(provider.resolveModelAlias('opus')).toBe('claude-opus-4-20250514');
			expect(provider.resolveModelAlias('sonnet')).toBe('claude-sonnet-4-20250514');
			expect(provider.resolveModelAlias('OPUS')).toBe('claude-opus-4-20250514');
			expect(provider.resolveModelAlias('Sonnet')).toBe('claude-sonnet-4-20250514');
		});

		test('should return model name as-is if not an alias', () => {
			const provider = new ClaudeCodeAIProvider();
			
			expect(provider.resolveModelAlias('claude-3-5-sonnet-20241022')).toBe('claude-3-5-sonnet-20241022');
			expect(provider.resolveModelAlias('custom-model')).toBe('custom-model');
		});

		test('should return null for empty model name', () => {
			const provider = new ClaudeCodeAIProvider();
			
			expect(provider.resolveModelAlias('')).toBeNull();
			expect(provider.resolveModelAlias(null)).toBeNull();
			expect(provider.resolveModelAlias(undefined)).toBeNull();
		});
	});

	describe('Command Parsing', () => {
		test('should parse simple commands', () => {
			const provider = new ClaudeCodeAIProvider();
			
			const result = provider.parseCommand('claude --model opus');
			expect(result.executable).toBe('claude');
			expect(result.args).toEqual(['--model', 'opus']);
		});

		test('should handle quoted paths with spaces', () => {
			const provider = new ClaudeCodeAIProvider();
			
			const result = provider.parseCommand('"/path with spaces/claude" --model opus');
			expect(result.executable).toBe('/path with spaces/claude');
			expect(result.args).toEqual(['--model', 'opus']);
		});

		test('should handle Windows-style quoted paths', () => {
			const provider = new ClaudeCodeAIProvider();
			
			const result = provider.parseCommand('"C:\\Program Files\\Claude\\claude.exe" --flag');
			expect(result.executable).toBe('C:\\Program Files\\Claude\\claude.exe');
			expect(result.args).toEqual(['--flag']);
		});
	});

	describe('Model Configuration Priority', () => {
		test('should add model flag from CLAUDE_CODE_MODEL env var', () => {
			process.env.CLAUDE_CODE_MODEL = 'opus';
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			
			const provider = new ClaudeCodeAIProvider();
			const command = provider.getClaudeCommand();
			
			expect(command).toBe('claude --model claude-opus-4-20250514');
		});

		test('should add model flag from params.modelId', () => {
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			
			const provider = new ClaudeCodeAIProvider();
			const command = provider.getClaudeCommand({ modelId: 'sonnet' });
			
			expect(command).toBe('claude --model claude-sonnet-4-20250514');
		});

		test('should prioritize params.modelId over CLAUDE_CODE_MODEL', () => {
			process.env.CLAUDE_CODE_MODEL = 'opus';
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			
			const provider = new ClaudeCodeAIProvider();
			const command = provider.getClaudeCommand({ modelId: 'sonnet' });
			
			expect(command).toBe('claude --model claude-sonnet-4-20250514');
		});

		test('should not add model flag if command already has one', () => {
			process.env.CLAUDE_CODE_COMMAND = 'claude --model claude-3-5-sonnet-20241022';
			process.env.CLAUDE_CODE_MODEL = 'opus';
			
			const provider = new ClaudeCodeAIProvider();
			const command = provider.getClaudeCommand();
			
			expect(command).toBe('claude --model claude-3-5-sonnet-20241022');
		});

		test('should handle model configuration in complex commands', () => {
			process.env.CLAUDE_CODE_COMMAND = '/path/to/claude --mcp-config /config.json';
			process.env.CLAUDE_CODE_MODEL = 'opus';
			
			const provider = new ClaudeCodeAIProvider();
			const command = provider.getClaudeCommand();
			
			expect(command).toBe('/path/to/claude --mcp-config /config.json --model claude-opus-4-20250514');
		});

		test('should handle quoted commands with model configuration', () => {
			process.env.CLAUDE_CODE_COMMAND = '"/path with spaces/claude" --flag';
			process.env.CLAUDE_CODE_MODEL = 'sonnet';
			
			const provider = new ClaudeCodeAIProvider();
			const command = provider.getClaudeCommand();
			
			expect(command).toBe('/path with spaces/claude --flag --model claude-sonnet-4-20250514');
		});

		test('should work with Windows-style paths and model configuration', () => {
			process.env.CLAUDE_CODE_COMMAND = '"C:\\Program Files\\Claude\\claude.exe"';
			
			const provider = new ClaudeCodeAIProvider();
			const command = provider.getClaudeCommand({ modelId: 'opus' });
			
			expect(command).toBe('C:\\Program Files\\Claude\\claude.exe --model claude-opus-4-20250514');
		});

		test('should handle edge case where model flag is last argument', () => {
			process.env.CLAUDE_CODE_COMMAND = 'claude --model';
			process.env.CLAUDE_CODE_MODEL = 'opus';
			
			const provider = new ClaudeCodeAIProvider();
			const command = provider.getClaudeCommand();
			
			// Should still add model flag since the existing one is incomplete
			expect(command).toBe('claude --model --model claude-opus-4-20250514');
		});
	});

	describe('Supported Models Configuration', () => {
		test('should be documented in supported-models.json', async () => {
			const supportedModels = await import(
				'../../scripts/modules/supported-models.json',
				{
					assert: { type: 'json' }
				}
			);

			const claudeLocal = supportedModels.default['claude-code'][0];
			expect(claudeLocal.description).toContain('Claude Code local instance');
			expect(claudeLocal.notes).toContain('CLAUDE_CODE_MODEL');
			expect(claudeLocal.notes).toContain('opus');
			expect(claudeLocal.notes).toContain('sonnet');
		});
	});
});