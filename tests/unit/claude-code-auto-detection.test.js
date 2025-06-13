import { jest } from '@jest/globals';
import { ClaudeCodeAIProvider } from '../../src/ai-providers/claude-code.js';

// Mock child_process
jest.mock('child_process', () => ({
	execSync: jest.fn(),
	spawn: jest.fn().mockReturnValue({
		stdin: { write: jest.fn(), end: jest.fn() },
		stdout: { on: jest.fn() },
		stderr: { on: jest.fn() },
		on: jest.fn(),
		kill: jest.fn()
	})
}));

// Mock fs
jest.mock('fs', () => ({
	existsSync: jest.fn(),
	accessSync: jest.fn(),
	writeFileSync: jest.fn(),
	unlinkSync: jest.fn(),
	createReadStream: jest.fn().mockReturnValue({
		pipe: jest.fn()
	}),
	constants: {
		F_OK: 0,
		X_OK: 1
	}
}));

// Mock os
jest.mock('os', () => ({
	tmpdir: jest.fn(() => '/tmp'),
	platform: jest.fn(() => 'linux'),
	homedir: jest.fn(() => '/home/user')
}));

describe('Claude Code Auto-detection', () => {
	let execSync;
	let existsSync;
	let accessSync;
	let platform;
	let originalEnv;

	beforeEach(async () => {
		// Save original env
		originalEnv = { ...process.env };
		
		// Import mocked functions
		const childProcess = await import('child_process');
		execSync = childProcess.execSync;
		
		const fs = await import('fs');
		existsSync = fs.existsSync;
		accessSync = fs.accessSync;
		
		const os = await import('os');
		platform = os.platform;
		
		// Clear all mocks
		jest.clearAllMocks();
	});

	afterEach(() => {
		// Restore env
		process.env = originalEnv;
	});

	test('should detect claude in PATH using which command', () => {
		delete process.env.CLAUDE_CODE_COMMAND;
		execSync.mockReturnValue('/usr/local/bin/claude\n');
		existsSync.mockReturnValue(true);
		accessSync.mockImplementation(() => {}); // No error means accessible

		const provider = new ClaudeCodeAIProvider();
		const command = provider.getClaudeCommand();

		expect(execSync).toHaveBeenCalledWith('which claude', { encoding: 'utf8' });
		expect(command).toBe('/usr/local/bin/claude');
	});

	test('should detect claude in common user locations', () => {
		delete process.env.CLAUDE_CODE_COMMAND;
		execSync.mockImplementation(() => { throw new Error('not found'); });
		existsSync.mockImplementation(path => path === '/home/user/.claude/local/claude');
		accessSync.mockImplementation(() => {}); // No error means accessible

		const provider = new ClaudeCodeAIProvider();
		const command = provider.getClaudeCommand();

		expect(command).toBe('/home/user/.claude/local/claude');
	});

	test('should detect claude on macOS in Applications', () => {
		delete process.env.CLAUDE_CODE_COMMAND;
		platform.mockReturnValue('darwin');
		execSync.mockImplementation(() => { throw new Error('not found'); });
		existsSync.mockImplementation(path => 
			path === '/Applications/Claude.app/Contents/MacOS/claude'
		);
		accessSync.mockImplementation(() => {}); // No error means accessible

		const provider = new ClaudeCodeAIProvider();
		const command = provider.getClaudeCommand();

		expect(command).toBe('/Applications/Claude.app/Contents/MacOS/claude');
	});

	test('should detect claude on Windows using where command', () => {
		delete process.env.CLAUDE_CODE_COMMAND;
		platform.mockReturnValue('win32');
		execSync.mockReturnValue('C:\\Program Files\\Claude\\claude.exe\r\n');
		existsSync.mockReturnValue(true);
		accessSync.mockImplementation(() => {}); // No error means accessible

		const provider = new ClaudeCodeAIProvider();
		const command = provider.getClaudeCommand();

		expect(execSync).toHaveBeenCalledWith('where claude', { encoding: 'utf8' });
		expect(command).toBe('C:\\Program Files\\Claude\\claude.exe');
	});

	test('should return null when claude is not found anywhere', () => {
		delete process.env.CLAUDE_CODE_COMMAND;
		execSync.mockImplementation(() => { throw new Error('not found'); });
		existsSync.mockReturnValue(false);

		const provider = new ClaudeCodeAIProvider();
		const command = provider.getClaudeCommand();

		expect(command).toBeNull();
	});

	test('should cache detection results', () => {
		delete process.env.CLAUDE_CODE_COMMAND;
		execSync.mockReturnValue('/usr/local/bin/claude\n');
		existsSync.mockReturnValue(true);
		accessSync.mockImplementation(() => {});

		const provider = new ClaudeCodeAIProvider();
		
		// First call
		const command1 = provider.getClaudeCommand();
		expect(execSync).toHaveBeenCalledTimes(1);
		
		// Second call should use cache
		const command2 = provider.getClaudeCommand();
		expect(execSync).toHaveBeenCalledTimes(1); // Still only called once
		expect(command1).toBe(command2);
	});

	test('should prioritize CLAUDE_CODE_COMMAND over auto-detection', () => {
		process.env.CLAUDE_CODE_COMMAND = '/custom/path/claude';
		execSync.mockReturnValue('/usr/local/bin/claude\n');

		const provider = new ClaudeCodeAIProvider();
		const command = provider.getClaudeCommand();

		expect(execSync).not.toHaveBeenCalled();
		expect(command).toBe('/custom/path/claude');
	});

	test('should prioritize parameter over environment and auto-detection', () => {
		process.env.CLAUDE_CODE_COMMAND = '/env/path/claude';
		execSync.mockReturnValue('/usr/local/bin/claude\n');

		const provider = new ClaudeCodeAIProvider();
		const command = provider.getClaudeCommand({ 
			claudeCodeCommand: '/param/path/claude' 
		});

		expect(execSync).not.toHaveBeenCalled();
		expect(command).toBe('/param/path/claude');
	});

	test('should provide helpful error message when claude is not found', async () => {
		delete process.env.CLAUDE_CODE_COMMAND;
		execSync.mockImplementation(() => { throw new Error('not found'); });
		existsSync.mockReturnValue(false);

		const provider = new ClaudeCodeAIProvider();
		
		// Mock spawn to simulate execution
		const spawn = (await import('child_process')).spawn;
		spawn.mockImplementation(() => ({
			stdin: { write: jest.fn(), end: jest.fn() },
			stdout: { on: jest.fn() },
			stderr: { on: jest.fn() },
			on: jest.fn((event, callback) => {
				if (event === 'close') {
					setTimeout(() => callback(1), 0);
				}
			}),
			kill: jest.fn()
		}));
		
		// Test error message
		await expect(provider.generateText({ 
			messages: [{ role: 'user', content: 'test' }] 
		})).rejects.toThrow(/Claude Code CLI not found/);
	});
});