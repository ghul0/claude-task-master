#!/usr/bin/env node

// Simple test of model configuration feature
import { ClaudeCodeAIProvider } from './src/ai-providers/claude-code.js';

console.log('Testing Claude Code Model Configuration...\n');

const provider = new ClaudeCodeAIProvider();

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