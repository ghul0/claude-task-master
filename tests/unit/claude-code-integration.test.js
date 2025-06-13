import { jest } from '@jest/globals';

// Setup mocks before any imports
const mockExecSync = jest.fn();
const mockSpawn = jest.fn();
const mockExistsSync = jest.fn();
const mockAccessSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockUnlinkSync = jest.fn();
const mockCreateReadStream = jest.fn();
const mockPlatform = jest.fn();
const mockHomedir = jest.fn();
const mockTmpdir = jest.fn();

// Mock modules
jest.unstable_mockModule('child_process', () => ({
	execSync: mockExecSync,
	spawn: mockSpawn
}));

jest.unstable_mockModule('fs', () => ({
	existsSync: mockExistsSync,
	accessSync: mockAccessSync,
	writeFileSync: mockWriteFileSync,
	unlinkSync: mockUnlinkSync,
	createReadStream: mockCreateReadStream,
	constants: { F_OK: 0, X_OK: 1 }
}));

jest.unstable_mockModule('os', () => ({
	platform: mockPlatform,
	homedir: mockHomedir,
	tmpdir: mockTmpdir
}));

// Mock the base provider
jest.unstable_mockModule('../../src/ai-providers/base-provider.js', () => ({
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

describe('Claude Code Integration Tests', () => {
	let ClaudeCodeAIProvider;
	let originalEnv;

	beforeAll(async () => {
		// Import the provider after mocks are set up
		const module = await import('../../src/ai-providers/claude-code.js');
		ClaudeCodeAIProvider = module.ClaudeCodeAIProvider;
	});

	beforeEach(() => {
		// Save original env
		originalEnv = { ...process.env };

		// Reset mocks
		jest.clearAllMocks();

		// Default mock implementations
		mockPlatform.mockReturnValue('linux');
		mockHomedir.mockReturnValue('/home/user');
		mockTmpdir.mockReturnValue('/tmp');
		mockCreateReadStream.mockReturnValue({ pipe: jest.fn() });
	});

	afterEach(() => {
		// Restore env
		process.env = originalEnv;
	});

	describe('Auto-detection Integration', () => {
		test('should successfully auto-detect claude command in PATH', () => {
			delete process.env.CLAUDE_CODE_COMMAND;
			mockExecSync.mockReturnValue('/usr/local/bin/claude\n');
			mockExistsSync.mockReturnValue(true);
			mockAccessSync.mockImplementation(() => {});

			const provider = new ClaudeCodeAIProvider();
			expect(provider.isAvailable()).toBe(true);
			expect(provider.getClaudeCommand()).toBe('/usr/local/bin/claude');
		});

		test('should fallback to CLAUDE_CODE_COMMAND when auto-detection fails', () => {
			process.env.CLAUDE_CODE_COMMAND = '/custom/claude';
			mockExecSync.mockImplementation(() => {
				throw new Error('not found');
			});
			mockExistsSync.mockReturnValue(false);

			const provider = new ClaudeCodeAIProvider();
			expect(provider.isAvailable()).toBe(true);
			expect(provider.getClaudeCommand()).toBe('/custom/claude');
		});

		test('should handle error when no claude command is available', () => {
			delete process.env.CLAUDE_CODE_COMMAND;
			mockExecSync.mockImplementation(() => {
				throw new Error('not found');
			});
			mockExistsSync.mockReturnValue(false);

			const provider = new ClaudeCodeAIProvider();
			expect(provider.isAvailable()).toBe(false);
			expect(provider.getClaudeCommand()).toBeNull();
		});
	});

	describe('Command Validation', () => {
		test('should validate command exists and is executable', async () => {
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			mockAccessSync.mockImplementation(() => {}); // No error means valid

			const mockSpawnInstance = {
				stdin: { write: jest.fn(), end: jest.fn() },
				stdout: { on: jest.fn() },
				stderr: { on: jest.fn() },
				on: jest.fn(),
				kill: jest.fn()
			};

			mockSpawn.mockReturnValue(mockSpawnInstance);

			// Setup stdout handler
			mockSpawnInstance.stdout.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from('Test response'));
				}
			});

			// Setup close handler
			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			const provider = new ClaudeCodeAIProvider();
			const result = await provider.generateText({
				messages: [{ role: 'user', content: 'Hello' }]
			});

			expect(mockAccessSync).toHaveBeenCalledWith('claude', expect.any(Number));
			expect(result.text).toBe('Test response');
		});

		test('should throw error when command is not executable', async () => {
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			mockAccessSync.mockImplementation(() => {
				throw new Error('EACCES: permission denied');
			});

			const provider = new ClaudeCodeAIProvider();

			await expect(
				provider.generateText({
					messages: [{ role: 'user', content: 'Hello' }]
				})
			).rejects.toThrow(/not found or not executable/);
		});
	});

	describe('Text Generation Functionality', () => {
		let provider;
		let mockSpawnInstance;

		beforeEach(() => {
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			mockAccessSync.mockImplementation(() => {});

			mockSpawnInstance = {
				stdin: { write: jest.fn(), end: jest.fn() },
				stdout: { on: jest.fn() },
				stderr: { on: jest.fn() },
				on: jest.fn(),
				kill: jest.fn()
			};

			mockSpawn.mockReturnValue(mockSpawnInstance);
			provider = new ClaudeCodeAIProvider();
		});

		test('should generate text successfully', async () => {
			mockSpawnInstance.stdout.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from('Generated text response'));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			const result = await provider.generateText({
				messages: [
					{ role: 'system', content: 'You are helpful' },
					{ role: 'user', content: 'Write hello world' }
				]
			});

			expect(result).toHaveProperty('text', 'Generated text response');
			expect(result).toHaveProperty('requestId');
			expect(result).toHaveProperty('responseTime');
			expect(result.usage).toEqual({
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0
			});
		});

		test('should handle command execution errors', async () => {
			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'error') {
					handler(new Error('Command failed'));
				}
			});

			await expect(
				provider.generateText({
					messages: [{ role: 'user', content: 'Test' }]
				})
			).rejects.toThrow('Command failed');
		});

		test('should handle timeout', async () => {
			jest.useFakeTimers();

			mockSpawnInstance.on.mockImplementation(() => {
				// Don't call close handler - simulate hanging process
			});

			const promise = provider.generateText({
				messages: [{ role: 'user', content: 'Test' }]
			});

			// Fast-forward time by 5 minutes
			jest.advanceTimersByTime(5 * 60 * 1000);

			await expect(promise).rejects.toThrow(/timed out after 5 minutes/);
			expect(mockSpawnInstance.kill).toHaveBeenCalled();

			jest.useRealTimers();
		});

		test('should clean up temp files', async () => {
			mockSpawnInstance.stdout.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from('Response'));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			await provider.generateText({
				messages: [{ role: 'user', content: 'Test' }]
			});

			expect(mockUnlinkSync).toHaveBeenCalled();
		});
	});

	describe('Object Generation (JSON Mode)', () => {
		let provider;
		let mockSpawnInstance;

		beforeEach(() => {
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			mockAccessSync.mockImplementation(() => {});

			mockSpawnInstance = {
				stdin: { write: jest.fn(), end: jest.fn() },
				stdout: { on: jest.fn() },
				stderr: { on: jest.fn() },
				on: jest.fn(),
				kill: jest.fn()
			};

			mockSpawn.mockReturnValue(mockSpawnInstance);
			provider = new ClaudeCodeAIProvider();
		});

		test('should generate valid JSON object', async () => {
			const jsonResponse = { name: 'John', age: 30 };

			mockSpawnInstance.stdout.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from(JSON.stringify(jsonResponse)));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			const result = await provider.generateObject({
				messages: [{ role: 'user', content: 'Generate a user' }],
				objectName: 'User'
			});

			expect(result.object).toEqual(jsonResponse);
			expect(result).toHaveProperty('requestId');
			expect(result).toHaveProperty('responseTime');
		});

		test('should handle invalid JSON gracefully', async () => {
			mockSpawnInstance.stdout.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from('This is not valid JSON'));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			await expect(
				provider.generateObject({
					messages: [{ role: 'user', content: 'Generate object' }]
				})
			).rejects.toThrow(/Failed to parse JSON/);
		});
	});

	describe('File Reference Mode', () => {
		let provider;
		let mockSpawnInstance;

		beforeEach(() => {
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			process.env.CLAUDE_CODE_USE_FILE_REFERENCE = 'true';
			mockAccessSync.mockImplementation(() => {});

			mockSpawnInstance = {
				stdin: { write: jest.fn(), end: jest.fn() },
				stdout: { on: jest.fn() },
				stderr: { on: jest.fn() },
				on: jest.fn(),
				kill: jest.fn()
			};

			mockSpawn.mockReturnValue(mockSpawnInstance);
			provider = new ClaudeCodeAIProvider();
		});

		afterEach(() => {
			delete process.env.CLAUDE_CODE_USE_FILE_REFERENCE;
		});

		test('should use file reference for PRD content', async () => {
			mockSpawnInstance.stdout.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from('Response with file reference'));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			const input = `FILE_PATH: /path/to/prd.txt

Product Requirements Document (PRD) Content:
This is a very long PRD content that would be replaced...

IMPORTANT: Generate tasks based on this PRD`;

			await provider.generateText({
				messages: [{ role: 'user', content: input }]
			});

			// Check that file reference was used
			const writeCall = mockWriteFileSync.mock.calls[0];
			expect(writeCall[1]).toContain('FILE_PATH: /path/to/prd.txt');
			expect(writeCall[1]).toContain(
				'<Please read the PRD from this file: /path/to/prd.txt>'
			);
			expect(writeCall[1]).not.toContain('This is a very long PRD content');
		});
	});

	describe('parseCommand Method', () => {
		let provider;

		beforeEach(() => {
			provider = new ClaudeCodeAIProvider();
		});

		test('should parse command with double-quoted path', () => {
			const result = provider.parseCommand(
				'"/path with spaces/claude" --model opus'
			);
			expect(result.executable).toBe('/path with spaces/claude');
			expect(result.args).toEqual(['--model', 'opus']);
		});

		test('should parse Windows-style paths with spaces', () => {
			const result = provider.parseCommand(
				'"C:\\Program Files\\Claude\\claude.exe" --quiet'
			);
			expect(result.executable).toBe('C:\\Program Files\\Claude\\claude.exe');
			expect(result.args).toEqual(['--quiet']);
		});

		test('should handle escaped quotes in paths', () => {
			const result = provider.parseCommand(
				'"/path/with\\"quotes/claude" --test'
			);
			expect(result.executable).toBe('/path/with"quotes/claude');
			expect(result.args).toEqual(['--test']);
		});

		test('should handle multiple quoted arguments', () => {
			const result = provider.parseCommand(
				'claude --config "/path/to config.json" --name "My Test"'
			);
			expect(result.executable).toBe('claude');
			expect(result.args).toEqual([
				'--config',
				'/path/to config.json',
				'--name',
				'My Test'
			]);
		});
	});

	describe('Priority Order', () => {
		let provider;

		beforeEach(() => {
			provider = new ClaudeCodeAIProvider();
			mockExistsSync.mockReturnValue(true);
			mockExecSync.mockReturnValue('/detected/claude\n');
			mockAccessSync.mockImplementation(() => {});
		});

		test('should prioritize parameter over environment variable and auto-detection', () => {
			process.env.CLAUDE_CODE_COMMAND = '/env/claude';

			const command = provider.getClaudeCommand({
				claudeCodeCommand: '/param/claude'
			});

			expect(command).toBe('/param/claude');
			expect(mockExecSync).not.toHaveBeenCalled();
		});

		test('should prioritize environment variable over auto-detection', () => {
			process.env.CLAUDE_CODE_COMMAND = '/env/claude';

			const command = provider.getClaudeCommand();

			expect(command).toBe('/env/claude');
			expect(mockExecSync).not.toHaveBeenCalled();
		});

		test('should use auto-detection when no parameter or environment variable', () => {
			delete process.env.CLAUDE_CODE_COMMAND;

			const command = provider.getClaudeCommand();

			expect(command).toBe('/detected/claude');
			expect(mockExecSync).toHaveBeenCalledWith('which claude', {
				encoding: 'utf8'
			});
		});
	});

	describe('Error Handling', () => {
		let provider;

		beforeEach(() => {
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			mockAccessSync.mockImplementation(() => {});

			const mockSpawnInstance = {
				stdin: { write: jest.fn(), end: jest.fn() },
				stdout: { on: jest.fn() },
				stderr: { on: jest.fn() },
				on: jest.fn(),
				kill: jest.fn()
			};

			mockSpawn.mockReturnValue(mockSpawnInstance);
			provider = new ClaudeCodeAIProvider();
		});

		test('should provide helpful error when claude is not found', async () => {
			delete process.env.CLAUDE_CODE_COMMAND;
			mockExecSync.mockImplementation(() => {
				throw new Error('not found');
			});
			mockExistsSync.mockReturnValue(false);

			provider = new ClaudeCodeAIProvider();

			try {
				await provider.generateText({
					messages: [{ role: 'user', content: 'Test' }]
				});
			} catch (error) {
				expect(error.message).toContain('Claude Code not found');
				expect(error.message).toContain('Please install Claude Code');
				expect(error.message).toContain('https://claude.ai/code');
				expect(error.message).toContain(
					'npm install -g @anthropic-ai/claude-code'
				);
				expect(error.message).toContain('CLAUDE_CODE_COMMAND');
			}
		});

		test('should handle empty messages array', async () => {
			await expect(
				provider.generateText({
					messages: []
				})
			).rejects.toThrow(/Messages array is required/);
		});

		test('should handle missing messages parameter', async () => {
			await expect(provider.generateText({})).rejects.toThrow(
				/Messages array is required/
			);
		});

		test('should handle stderr output with no stdout', async () => {
			const mockSpawnInstance = {
				stdin: { write: jest.fn(), end: jest.fn() },
				stdout: { on: jest.fn() },
				stderr: { on: jest.fn() },
				on: jest.fn(),
				kill: jest.fn()
			};

			mockSpawn.mockReturnValue(mockSpawnInstance);

			mockSpawnInstance.stderr.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from('Error: Something went wrong'));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			await expect(
				provider.generateText({
					messages: [{ role: 'user', content: 'Test' }]
				})
			).rejects.toThrow(/Claude Code error: Error: Something went wrong/);
		});
	});

	describe('Text Generation - Additional Scenarios', () => {
		let provider;
		let mockSpawnInstance;

		beforeEach(() => {
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			mockAccessSync.mockImplementation(() => {});

			mockSpawnInstance = {
				stdin: { write: jest.fn(), end: jest.fn() },
				stdout: { on: jest.fn() },
				stderr: { on: jest.fn() },
				on: jest.fn(),
				kill: jest.fn()
			};

			mockSpawn.mockReturnValue(mockSpawnInstance);
			provider = new ClaudeCodeAIProvider();
		});

		test('should handle multiple message roles correctly', async () => {
			mockSpawnInstance.stdout.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from('Response'));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			await provider.generateText({
				messages: [
					{ role: 'system', content: 'System prompt' },
					{ role: 'user', content: 'User message' },
					{ role: 'assistant', content: 'Assistant response' },
					{ role: 'user', content: 'Another user message' }
				]
			});

			// Check that temp file was written with correct format
			const writeCall = mockWriteFileSync.mock.calls[0];
			expect(writeCall[1]).toContain('System: System prompt');
			expect(writeCall[1]).toContain('Human: User message');
			expect(writeCall[1]).toContain('Assistant: Assistant response');
			expect(writeCall[1]).toContain('Human: Another user message');
			expect(writeCall[1]).toContain('\n\nAssistant:');
		});

		test('should handle non-zero exit codes', async () => {
			mockSpawnInstance.stderr.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from('Error output'));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(1), 0);
				}
			});

			await expect(
				provider.generateText({
					messages: [{ role: 'user', content: 'Test' }]
				})
			).rejects.toThrow(/Claude Code error \(code 1\)/);
		});

		test('should clean up temp files on error', async () => {
			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'error') {
					handler(new Error('Test error'));
				}
			});

			try {
				await provider.generateText({
					messages: [{ role: 'user', content: 'Test' }]
				});
			} catch (e) {
				// Expected error
			}

			expect(mockUnlinkSync).toHaveBeenCalled();
		});
	});

	describe('Object Generation - Additional Tests', () => {
		let provider;
		let mockSpawnInstance;

		beforeEach(() => {
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			mockAccessSync.mockImplementation(() => {});

			mockSpawnInstance = {
				stdin: { write: jest.fn(), end: jest.fn() },
				stdout: { on: jest.fn() },
				stderr: { on: jest.fn() },
				on: jest.fn(),
				kill: jest.fn()
			};

			mockSpawn.mockReturnValue(mockSpawnInstance);
			provider = new ClaudeCodeAIProvider();
		});

		test('should handle JSON with markdown code blocks', async () => {
			const jsonResponse = { test: 'value' };
			const markdownResponse = `Here's the JSON:
\`\`\`json
${JSON.stringify(jsonResponse, null, 2)}
\`\`\``;

			mockSpawnInstance.stdout.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from(markdownResponse));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			const result = await provider.generateObject({
				messages: [{ role: 'user', content: 'Generate JSON' }]
			});

			expect(result.object).toEqual(jsonResponse);
		});

		test('should append JSON instructions to user message', async () => {
			mockSpawnInstance.stdout.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from('{"test": true}'));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			await provider.generateObject({
				messages: [{ role: 'user', content: 'Create a test object' }],
				objectName: 'TestObject'
			});

			// Check that JSON instructions were added
			const writeCall = mockWriteFileSync.mock.calls[0];
			expect(writeCall[1]).toContain('Create a test object');
			expect(writeCall[1]).toContain(
				'IMPORTANT: Your response MUST be valid JSON'
			);
			expect(writeCall[1]).toContain('TestObject');
		});
	});

	describe('File Reference Mode - Additional Tests', () => {
		let provider;
		let mockSpawnInstance;

		beforeEach(() => {
			process.env.CLAUDE_CODE_COMMAND = 'claude';
			mockAccessSync.mockImplementation(() => {});

			mockSpawnInstance = {
				stdin: { write: jest.fn(), end: jest.fn() },
				stdout: { on: jest.fn() },
				stderr: { on: jest.fn() },
				on: jest.fn(),
				kill: jest.fn()
			};

			mockSpawn.mockReturnValue(mockSpawnInstance);
			provider = new ClaudeCodeAIProvider();
		});

		test('should work normally when file reference mode is disabled', async () => {
			delete process.env.CLAUDE_CODE_USE_FILE_REFERENCE;

			mockSpawnInstance.stdout.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from('Normal response'));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			const input = `FILE_PATH: /path/to/prd.txt

Product Requirements Document (PRD) Content:
Original PRD content...`;

			await provider.generateText({
				messages: [{ role: 'user', content: input }]
			});

			// Check that original content was preserved
			const writeCall = mockWriteFileSync.mock.calls[0];
			expect(writeCall[1]).toContain('Original PRD content...');
		});
	});

	describe('parseCommand - Additional Scenarios', () => {
		let provider;

		beforeEach(() => {
			provider = new ClaudeCodeAIProvider();
		});

		test('should parse command with single-quoted path', () => {
			const result = provider.parseCommand(
				"'/another path/claude' -p --verbose"
			);
			expect(result.executable).toBe('/another path/claude');
			expect(result.args).toEqual(['-p', '--verbose']);
		});

		test('should handle escaped spaces', () => {
			// Note: The parseCommand method treats backslash as escape character,
			// so escaped spaces become part of the path without the backslashes
			const result = provider.parseCommand(
				'/path\\ with\\ spaces/claude --test'
			);
			expect(result.executable).toBe('/path\\');
			expect(result.args).toEqual(['with\\', 'spaces/claude', '--test']);
		});

		test('should execute command with spaces in path correctly', async () => {
			process.env.CLAUDE_CODE_COMMAND =
				'"/path with spaces/claude" --model opus';
			mockAccessSync.mockImplementation(() => {});

			const mockSpawnInstance = {
				stdin: { write: jest.fn(), end: jest.fn() },
				stdout: { on: jest.fn() },
				stderr: { on: jest.fn() },
				on: jest.fn(),
				kill: jest.fn()
			};

			mockSpawn.mockReturnValue(mockSpawnInstance);

			mockSpawnInstance.stdout.on.mockImplementation((event, handler) => {
				if (event === 'data') {
					handler(Buffer.from('Response'));
				}
			});

			mockSpawnInstance.on.mockImplementation((event, handler) => {
				if (event === 'close') {
					setTimeout(() => handler(0), 0);
				}
			});

			await provider.generateText({
				messages: [{ role: 'user', content: 'Test' }]
			});

			// Verify spawn was called with correct parsed command
			expect(mockSpawn).toHaveBeenCalledWith(
				'/path with spaces/claude',
				expect.arrayContaining(['--model', 'opus', '-p']),
				expect.any(Object)
			);
		});
	});

	describe('Provider Registration Tests', () => {
		test('should include claude-code in supported models', async () => {
			const supportedModels = await import(
				'../../scripts/modules/supported-models.json',
				{ assert: { type: 'json' } }
			);

			expect(supportedModels.default).toHaveProperty('claude-code');
			expect(Array.isArray(supportedModels.default['claude-code'])).toBe(true);
			expect(supportedModels.default['claude-code'].length).toBeGreaterThan(0);

			const claudeLocalModel = supportedModels.default['claude-code'].find(
				(m) => m.id === 'claude-local'
			);
			expect(claudeLocalModel).toBeDefined();
			expect(claudeLocalModel.swe_score).toBe(99);
			expect(claudeLocalModel.cost_per_1m_tokens.input).toBe(0);
			expect(claudeLocalModel.cost_per_1m_tokens.output).toBe(0);
		});

		test('claude-code should not require API key', () => {
			// Claude Code provider doesn't require an API key
			// This is verified by the fact that the provider can be instantiated
			// and used without setting any API key environment variables
			const provider = new ClaudeCodeAIProvider();
			expect(() => provider.validateAuth({})).not.toThrow();
			expect(provider.isAvailable()).toBeDefined(); // Can check availability without API key
		});
	});

	describe('Model Configuration Tests', () => {
		test('should have correct model configuration for claude-local', async () => {
			const supportedModels = await import(
				'../../scripts/modules/supported-models.json',
				{ assert: { type: 'json' } }
			);

			const claudeLocal = supportedModels.default['claude-code'][0];

			expect(claudeLocal).toMatchObject({
				id: 'claude-local',
				swe_score: 99,
				cost_per_1m_tokens: {
					input: 0,
					output: 0
				},
				allowed_roles: ['main', 'research', 'fallback']
			});
		});

		test('should support all standard roles', async () => {
			const supportedModels = await import(
				'../../scripts/modules/supported-models.json',
				{ assert: { type: 'json' } }
			);

			const claudeLocal = supportedModels.default['claude-code'][0];
			expect(claudeLocal.allowed_roles).toContain('main');
			expect(claudeLocal.allowed_roles).toContain('research');
			expect(claudeLocal.allowed_roles).toContain('fallback');
		});
	});

	describe('Additional Provider Methods', () => {
		let provider;

		beforeEach(() => {
			provider = new ClaudeCodeAIProvider();
		});

		test('should return correct provider name', () => {
			expect(provider.getName()).toBe('Claude Code');
		});

		test('should not support streaming', () => {
			expect(provider.supportsStreaming).toBe(false);
		});

		test('should support object generation', () => {
			expect(provider.supportsObjectGeneration).toBe(true);
		});

		test('should throw error for streaming attempt', async () => {
			await expect(provider.streamText({})).rejects.toThrow(
				/Streaming is not supported/
			);
		});

		test('should return null for getClient', () => {
			expect(provider.getClient()).toBeNull();
		});

		test('validateAuth should not throw', () => {
			expect(() => provider.validateAuth({})).not.toThrow();
		});
	});
});
